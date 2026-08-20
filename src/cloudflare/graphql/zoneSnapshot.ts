import { listConnections } from '../connections';
import {
  getConnectionBearer,
  type ZoneListItem,
  type ZonesSnapshot,
} from '../resources';
import { createTtlCache } from '../ttlCache';
import {
  ZONES_PER_QUERY,
  dailyUniques,
  runAccountQuery,
  runQuery,
  utcDateString,
  type RawZone,
} from './client';

/** Hourly totals for one zone over the last 24 hours. */
export interface ZoneAnalytics {
  zoneId: string;
  accountId: string;
  requests: number;
  threats: number;
  bytes: number;
  cachedBytes: number;
  /**
   * Unique IPs for the current UTC day from httpRequests1dGroups.
   * Do not sum hourly uniq.uniques — that overcounts repeat visitors.
   */
  uniques: number;
  /**
   * Web Analytics visits (JS beacon) for the last 24h. Matches the
   * dashboard Visits number and already excludes bots. Null when RUM
   * is unavailable for the zone — do not fall back to HTTP uniques.
   */
  visits: number | null;
  /** Web Analytics page views for the last 24h. */
  pageViews: number | null;
  /** Hourly requests keyed by the ISO datetime of the hour bucket. */
  series: { datetime: string; requests: number }[];
}

export interface FirewallEvent {
  zoneId: string;
  accountId: string;
  action: string;
  ruleId: string;
  clientIP: string;
  country: string;
  datetime: string;
}

export interface AnalyticsSnapshot {
  /** False when no connected credential could read analytics. */
  available: boolean;
  zones: ZoneAnalytics[];
  events: FirewallEvent[];
}

export interface AggregatedAnalytics {
  requests: number;
  threats: number;
  bytes: number;
  cachedBytes: number;
  uniques: number;
  visits: number | null;
  pageViews: number | null;
  /** 24h request series, oldest first, labelled with the UTC hour. */
  series: { label: string; value: number }[];
}

// Cloudflare's GraphQL schema uses lowercase scalar names (string, Time, Date).
//
// HTTP rollups cover requests / bandwidth / cache. Visits and page views
// come from account-scoped Web Analytics (rumPageloadEventsAdaptiveGroups),
// not from httpRequestsAdaptiveGroups or summed hourly uniques.
const buildQuery = (withFirewall: boolean) =>
  `query ($tags: [string!], $since: Time, $sinceDate: Date) {
  viewer {
    zones(filter: { zoneTag_in: $tags }) {
      zoneTag
      httpRequests1hGroups(limit: 72, filter: { datetime_geq: $since }, orderBy: [datetime_ASC]) {
        sum { requests threats bytes cachedBytes }
        dimensions { datetime }
      }
      httpRequests1dGroups(limit: 1, filter: { date_geq: $sinceDate }, orderBy: [date_DESC]) {
        uniq { uniques }
        sum { pageViews }
        dimensions { date }
      }
      ${
        withFirewall
          ? `firewallEventsAdaptive(limit: 8, filter: { datetime_geq: $since }, orderBy: [datetime_DESC]) {
        action ruleId clientIP clientCountryName datetime
      }`
          : ''
      }
    }
  }
}`;

const ANALYTICS_QUERY = buildQuery(true);
const TRAFFIC_ONLY_QUERY = buildQuery(false);
const ROLLUP_ONLY_QUERY = buildQuery(false);

async function fetchConnectionAnalytics(
  bearer: string,
  zones: ZoneListItem[],
  since: string,
): Promise<{ analytics: ZoneAnalytics[]; events: FirewallEvent[] }> {
  const accountByZone = new Map(zones.map((zone) => [zone.id, zone.accountId]));

  const chunks: string[][] = [];
  for (let i = 0; i < zones.length; i += ZONES_PER_QUERY) {
    chunks.push(zones.slice(i, i + ZONES_PER_QUERY).map((zone) => zone.id));
  }

  const variables = { since, sinceDate: utcDateString() };
  const raw: RawZone[] = (
    await Promise.all(
      chunks.map(async (tags) => {
        const vars = { tags, ...variables };
        return runQuery(bearer, ANALYTICS_QUERY, vars)
          .catch(() => runQuery(bearer, TRAFFIC_ONLY_QUERY, vars))
          .catch(() => runQuery(bearer, ROLLUP_ONLY_QUERY, vars));
      }),
    )
  ).flat();

  const analytics: ZoneAnalytics[] = [];
  const events: FirewallEvent[] = [];
  for (const zone of raw) {
    if (!zone.zoneTag) {
      continue;
    }
    const accountId = accountByZone.get(zone.zoneTag) ?? '';
    const groups = zone.httpRequests1hGroups ?? [];
    analytics.push({
      zoneId: zone.zoneTag,
      accountId,
      requests: groups.reduce((sum, g) => sum + (g.sum?.requests ?? 0), 0),
      threats: groups.reduce((sum, g) => sum + (g.sum?.threats ?? 0), 0),
      bytes: groups.reduce((sum, g) => sum + (g.sum?.bytes ?? 0), 0),
      cachedBytes: groups.reduce(
        (sum, g) => sum + (g.sum?.cachedBytes ?? 0),
        0,
      ),
      uniques: dailyUniques(zone),
      visits: null,
      pageViews: null,
      series: groups
        .filter((g) => g.dimensions?.datetime)
        .map((g) => ({
          datetime: g.dimensions?.datetime ?? '',
          requests: g.sum?.requests ?? 0,
        })),
    });
    for (const event of zone.firewallEventsAdaptive ?? []) {
      events.push({
        zoneId: zone.zoneTag,
        accountId,
        action: event.action ?? 'log',
        ruleId: event.ruleId ?? '',
        clientIP: event.clientIP ?? '',
        country: event.clientCountryName ?? '',
        datetime: event.datetime ?? '',
      });
    }
  }

  await overlayWebAnalytics(bearer, zones, analytics, since).catch((cause) => {
    if (__DEV__) {
      console.warn('[analytics] web analytics overlay skipped:', cause);
    }
  });

  return { analytics, events };
}

interface RumHostGroup {
  count?: number;
  sum?: { visits?: number };
  dimensions?: { requestHost?: string };
}

interface RumAccount {
  rumPageloadEventsAdaptiveGroups?: RumHostGroup[];
}

/** Account-wide Web Analytics, grouped by host — no site_info REST permission. */
const RUM_BY_HOST_QUERY = `query ($accountTag: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        limit: 200
        filter: { datetime_geq: $since }
        orderBy: [sum_visits_DESC]
      ) {
        count
        sum { visits }
        dimensions { requestHost }
      }
    }
  }
}`;

/**
 * Scores how well a RUM host belongs to a zone. Returns the matched zone
 * name length so callers can pick the most specific zone, or -1 when the
 * host is unrelated. Subdomains (e.g. figma.pluginsage.com) count toward
 * their apex zone (pluginsage.com), matching the dashboard's per-zone
 * Web Analytics totals.
 */
function zoneMatchScore(host: string, zoneName: string): number {
  const bareHost = host.replace(/^www\./, '').toLowerCase();
  const bareZone = zoneName.replace(/^www\./, '').toLowerCase();
  if (!bareZone) {
    return -1;
  }
  if (bareHost === bareZone) {
    return bareZone.length;
  }
  if (bareHost.endsWith(`.${bareZone}`)) {
    return bareZone.length;
  }
  return -1;
}

async function fetchRumByHost(
  bearer: string,
  accountId: string,
  since: string,
): Promise<RumHostGroup[]> {
  const accounts = await runAccountQuery<RumAccount>(bearer, RUM_BY_HOST_QUERY, {
    accountTag: accountId,
    since,
  });
  return accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];
}

/** Overlay dashboard Web Analytics visits/page views onto zone rows. */
async function overlayWebAnalytics(
  bearer: string,
  zones: ZoneListItem[],
  analytics: ZoneAnalytics[],
  since: string,
): Promise<void> {
  const accountIds = [...new Set(zones.map((zone) => zone.accountId).filter(Boolean))];
  const byZoneId = new Map<string, { visits: number; pageViews: number }>();

  await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        const groups = await fetchRumByHost(bearer, accountId, since);
        const accountZones = zones.filter((zone) => zone.accountId === accountId);
        for (const group of groups) {
          const host = group.dimensions?.requestHost;
          if (!host) {
            continue;
          }
          // Assign each host to the most specific (longest) matching zone so a
          // subdomain zone wins over its apex when both are connected.
          let zone: ZoneListItem | null = null;
          let bestScore = -1;
          for (const item of accountZones) {
            const score = zoneMatchScore(host, item.name);
            if (score > bestScore) {
              bestScore = score;
              zone = item;
            }
          }
          if (!zone) {
            continue;
          }
          const current = byZoneId.get(zone.id);
          byZoneId.set(zone.id, {
            visits: (current?.visits ?? 0) + (group.sum?.visits ?? 0),
            pageViews: (current?.pageViews ?? 0) + (group.count ?? 0),
          });
        }
      } catch (cause) {
        if (__DEV__) {
          console.warn('[analytics] rum skipped for', accountId, cause);
        }
      }
    }),
  );

  for (const row of analytics) {
    const rum = byZoneId.get(row.zoneId);
    if (!rum) {
      continue;
    }
    row.visits = rum.visits;
    row.pageViews = rum.pageViews;
  }
}

async function fetchSnapshot(
  zonesSnapshot: ZonesSnapshot,
): Promise<AnalyticsSnapshot> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const zonesByConnection = new Map<string, ZoneListItem[]>();
  for (const zone of zonesSnapshot.zones) {
    const list = zonesByConnection.get(zone.connectionId) ?? [];
    list.push(zone);
    zonesByConnection.set(zone.connectionId, list);
  }

  const connections = await listConnections();
  const zones: ZoneAnalytics[] = [];
  const events: FirewallEvent[] = [];

  await Promise.all(
    [...zonesByConnection.entries()].map(async ([connectionId, list]) => {
      const connection = connections.find((item) => item.id === connectionId);
      if (!connection) {
        return;
      }
      try {
        const bearer = await getConnectionBearer(connection);
        if (!bearer) {
          return;
        }
        const result = await fetchConnectionAnalytics(bearer, list, since);
        zones.push(...result.analytics);
        events.push(...result.events);
      } catch (cause) {
        // Analytics are best-effort; the Home screen degrades gracefully.
        if (__DEV__) {
          console.warn('[analytics] connection skipped:', cause);
        }
      }
    }),
  );

  events.sort((a, b) => b.datetime.localeCompare(a.datetime));
  return { available: zones.length > 0, zones, events };
}

/**
 * Sums zone analytics into the totals and the 24h series shown on Home.
 * Pass an accountId to scope the aggregate to a single Cloudflare account.
 */
export function aggregateAnalytics(
  snapshot: AnalyticsSnapshot,
  accountId?: string,
): AggregatedAnalytics {
  const zones = accountId
    ? snapshot.zones.filter((zone) => zone.accountId === accountId)
    : snapshot.zones;

  const byHour = new Map<string, number>();
  let requests = 0;
  let threats = 0;
  let bytes = 0;
  let cachedBytes = 0;
  let uniques = 0;
  let visitsTotal = 0;
  let visitsSeen = false;
  let pageViewsTotal = 0;
  let pageViewsSeen = false;
  for (const zone of zones) {
    requests += zone.requests;
    threats += zone.threats;
    bytes += zone.bytes;
    cachedBytes += zone.cachedBytes;
    uniques += zone.uniques;
    if (zone.visits !== null) {
      visitsTotal += zone.visits;
      visitsSeen = true;
    }
    if (zone.pageViews !== null) {
      pageViewsTotal += zone.pageViews;
      pageViewsSeen = true;
    }
    for (const point of zone.series) {
      byHour.set(point.datetime, (byHour.get(point.datetime) ?? 0) + point.requests);
    }
  }

  const series = [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([datetime, value]) => ({
      label: String(new Date(datetime).getUTCHours()).padStart(2, '0'),
      value,
    }));

  return {
    requests,
    threats,
    bytes,
    cachedBytes,
    uniques,
    visits: visitsSeen ? visitsTotal : null,
    pageViews: pageViewsSeen ? pageViewsTotal : null,
    series,
  };
}

const ANALYTICS_TTL_MS = 60_000;

const analyticsCache = createTtlCache<AnalyticsSnapshot, [ZonesSnapshot]>(
  ANALYTICS_TTL_MS,
  fetchSnapshot,
);

export function fetchAnalyticsSnapshot(
  zonesSnapshot: ZonesSnapshot,
  options?: { force?: boolean },
): Promise<AnalyticsSnapshot> {
  return analyticsCache.get(options, zonesSnapshot);
}

export function invalidateAnalyticsSnapshot(): void {
  analyticsCache.invalidate();
}
