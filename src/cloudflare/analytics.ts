import { listConnections } from './connections';
import {
  getConnectionBearer,
  type ZoneListItem,
  type ZonesSnapshot,
} from './resources';

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

/** Hourly totals for one zone over the last 24 hours. */
export interface ZoneAnalytics {
  zoneId: string;
  accountId: string;
  requests: number;
  threats: number;
  bytes: number;
  cachedBytes: number;
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
  /** 24h request series, oldest first, labelled with the UTC hour. */
  series: { label: string; value: number }[];
}

// Cloudflare's GraphQL schema uses lowercase scalar names (string, Time).
const buildQuery = (withFirewall: boolean) => `query ($tags: [string!], $since: Time) {
  viewer {
    zones(filter: { zoneTag_in: $tags }) {
      zoneTag
      httpRequests1hGroups(limit: 72, filter: { datetime_geq: $since }, orderBy: [datetime_ASC]) {
        sum { requests threats bytes cachedBytes }
        dimensions { datetime }
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
/** Same query without firewall events, for tokens lacking that dataset. */
const TRAFFIC_ONLY_QUERY = buildQuery(false);

interface RawHourGroup {
  sum?: {
    requests?: number;
    threats?: number;
    bytes?: number;
    cachedBytes?: number;
    cachedRequests?: number;
  };
  uniq?: { uniques?: number };
  dimensions?: { datetime?: string };
}

interface RawFirewallEvent {
  action?: string;
  ruleId?: string;
  clientIP?: string;
  clientCountryName?: string;
  clientRequestPath?: string;
  datetime?: string;
}

interface RawZone {
  zoneTag?: string;
  httpRequests1hGroups?: RawHourGroup[];
  httpRequests1dGroups?: RawHourGroup[];
  firewallEventsAdaptive?: RawFirewallEvent[];
}

interface GraphqlBody {
  data?: { viewer?: { zones?: RawZone[] } } | null;
  errors?: unknown[] | null;
}

async function runQuery(
  bearer: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<RawZone[]> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as GraphqlBody;
  const zones = body.data?.viewer?.zones;
  if (!zones) {
    const detail = JSON.stringify(body.errors ?? []).slice(0, 300);
    throw new Error(`analytics-unavailable: ${detail}`);
  }
  return zones;
}

/** Cloudflare GraphQL rejects queries covering more than ~10 zones. */
const ZONES_PER_QUERY = 10;

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

  const raw: RawZone[] = (
    await Promise.all(
      chunks.map(async (tags) => {
        try {
          return await runQuery(bearer, ANALYTICS_QUERY, { tags, since });
        } catch {
          // Firewall events need extra permissions; retry without them.
          return runQuery(bearer, TRAFFIC_ONLY_QUERY, { tags, since });
        }
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
  return { analytics, events };
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
  for (const zone of zones) {
    requests += zone.requests;
    threats += zone.threats;
    bytes += zone.bytes;
    cachedBytes += zone.cachedBytes;
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

  return { requests, threats, bytes, cachedBytes, series };
}

const ANALYTICS_TTL_MS = 60_000;

let cached: { at: number; promise: Promise<AnalyticsSnapshot> } | null = null;

export function fetchAnalyticsSnapshot(
  zonesSnapshot: ZonesSnapshot,
  options?: { force?: boolean },
): Promise<AnalyticsSnapshot> {
  const now = Date.now();
  if (!options?.force && cached && now - cached.at < ANALYTICS_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchSnapshot(zonesSnapshot);
  cached = { at: now, promise };
  promise.catch(() => {
    if (cached?.promise === promise) {
      cached = null;
    }
  });
  return promise;
}

export function invalidateAnalyticsSnapshot(): void {
  cached = null;
}

/** 30-day traffic summary for a single zone, shown on the zone detail page. */
export interface ZoneTraffic {
  requests: number;
  threats: number;
  cachedRequests: number;
  bytes: number;
  cachedBytes: number;
  /** 0–100, or null when the zone served no requests in the window. */
  cacheRatioPct: number | null;
}

const ZONE_TRAFFIC_QUERY = `query ($tag: string, $since: Date) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      zoneTag
      httpRequests1dGroups(limit: 40, filter: { date_geq: $since }) {
        sum { requests threats cachedRequests bytes cachedBytes }
      }
    }
  }
}`;

export async function fetchZoneTraffic(
  bearer: string,
  zoneId: string,
): Promise<ZoneTraffic> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const zones = await runQuery(bearer, ZONE_TRAFFIC_QUERY, {
    tag: zoneId,
    since,
  });

  let requests = 0;
  let threats = 0;
  let cachedRequests = 0;
  let bytes = 0;
  let cachedBytes = 0;
  for (const zone of zones) {
    for (const group of zone.httpRequests1dGroups ?? []) {
      requests += group.sum?.requests ?? 0;
      threats += group.sum?.threats ?? 0;
      cachedRequests += group.sum?.cachedRequests ?? 0;
      bytes += group.sum?.bytes ?? 0;
      cachedBytes += group.sum?.cachedBytes ?? 0;
    }
  }

  return {
    requests,
    threats,
    cachedRequests,
    bytes,
    cachedBytes,
    cacheRatioPct:
      requests > 0 ? Math.round((cachedRequests / requests) * 100) : null,
  };
}

/** 24h hourly breakdown for a single zone (analytics sub-page). */
export interface ZoneHourlyAnalytics {
  requests: number;
  threats: number;
  cachedRequests: number;
  uniques: number;
  /** 0–100, or null when the zone served no requests in the window. */
  cacheRatioPct: number | null;
  series: { label: string; value: number }[];
}

const ZONE_HOURLY_QUERY = `query ($tag: string, $since: Time) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      zoneTag
      httpRequests1hGroups(limit: 72, filter: { datetime_geq: $since }, orderBy: [datetime_ASC]) {
        sum { requests threats cachedRequests }
        uniq { uniques }
        dimensions { datetime }
      }
    }
  }
}`;

export async function fetchZoneHourly(
  bearer: string,
  zoneId: string,
): Promise<ZoneHourlyAnalytics> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const zones = await runQuery(bearer, ZONE_HOURLY_QUERY, {
    tag: zoneId,
    since,
  });

  let requests = 0;
  let threats = 0;
  let cachedRequests = 0;
  let uniques = 0;
  const series: { label: string; value: number }[] = [];
  for (const zone of zones) {
    for (const group of zone.httpRequests1hGroups ?? []) {
      requests += group.sum?.requests ?? 0;
      threats += group.sum?.threats ?? 0;
      cachedRequests += group.sum?.cachedRequests ?? 0;
      uniques += group.uniq?.uniques ?? 0;
      if (group.dimensions?.datetime) {
        series.push({
          label: String(
            new Date(group.dimensions.datetime).getUTCHours(),
          ).padStart(2, '0'),
          value: group.sum?.requests ?? 0,
        });
      }
    }
  }

  return {
    requests,
    threats,
    cachedRequests,
    uniques,
    cacheRatioPct:
      requests > 0 ? Math.round((cachedRequests / requests) * 100) : null,
    series: series.slice(-24),
  };
}

const ZONE_EVENTS_QUERY = `query ($tag: string, $since: Time) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      zoneTag
      firewallEventsAdaptive(limit: 25, filter: { datetime_geq: $since }, orderBy: [datetime_DESC]) {
        action ruleId clientIP clientCountryName clientRequestPath datetime
      }
    }
  }
}`;

export interface ZoneFirewallEvent {
  action: string;
  ruleId: string;
  clientIP: string;
  country: string;
  path: string;
  datetime: string;
}

export async function fetchZoneFirewallEvents(
  bearer: string,
  zoneId: string,
): Promise<ZoneFirewallEvent[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const zones = await runQuery(bearer, ZONE_EVENTS_QUERY, {
    tag: zoneId,
    since,
  });

  const events: ZoneFirewallEvent[] = [];
  for (const zone of zones) {
    for (const event of zone.firewallEventsAdaptive ?? []) {
      events.push({
        action: event.action ?? 'log',
        ruleId: event.ruleId ?? '',
        clientIP: event.clientIP ?? '',
        country: event.clientCountryName ?? '',
        path: event.clientRequestPath ?? '',
        datetime: event.datetime ?? '',
      });
    }
  }
  return events;
}
