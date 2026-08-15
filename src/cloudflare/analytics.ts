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

function utcDateString(daysAgo = 0): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
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

interface RawHourGroup {
  sum?: {
    requests?: number;
    threats?: number;
    bytes?: number;
    cachedBytes?: number;
    cachedRequests?: number;
    visits?: number;
  };
  uniq?: { uniques?: number };
  count?: number;
  dimensions?: { datetime?: string; date?: string };
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
  httpRequestsAdaptiveGroups?: RawHourGroup[];
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

function dailyUniques(zone: RawZone): number {
  const groups = zone.httpRequests1dGroups ?? [];
  const today = utcDateString();
  const match =
    groups.find((group) => group.dimensions?.date === today) ?? groups[0];
  return match?.uniq?.uniques ?? 0;
}

function eyeballVisits(zone: RawZone): number | null {
  if (!zone.httpRequestsAdaptiveGroups) {
    return null;
  }
  return zone.httpRequestsAdaptiveGroups.reduce(
    (sum, group) => sum + (group.sum?.visits ?? 0),
    0,
  );
}

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

interface RumGraphqlBody {
  data?: {
    viewer?: {
      accounts?: {
        rumPageloadEventsAdaptiveGroups?: RumHostGroup[];
      }[];
    };
  } | null;
  errors?: unknown[] | null;
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

function hostMatchesZone(host: string, zoneName: string): boolean {
  const bareHost = host.replace(/^www\./, '').toLowerCase();
  const bareZone = zoneName.replace(/^www\./, '').toLowerCase();
  return bareHost === bareZone || host.toLowerCase() === zoneName.toLowerCase();
}

async function fetchRumByHost(
  bearer: string,
  accountId: string,
  since: string,
): Promise<RumHostGroup[]> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: RUM_BY_HOST_QUERY,
      variables: { accountTag: accountId, since },
    }),
  });
  const body = (await response.json()) as RumGraphqlBody;
  return body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
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
          const zone = accountZones.find((item) => hostMatchesZone(host, item.name));
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
  visits: number | null;
  /** 0–100, or null when the zone served no requests in the window. */
  cacheRatioPct: number | null;
  series: { label: string; value: number }[];
}

const ZONE_HOURLY_QUERY = `query ($tag: string, $since: Time, $sinceDate: Date) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      zoneTag
      httpRequests1hGroups(limit: 72, filter: { datetime_geq: $since }, orderBy: [datetime_ASC]) {
        sum { requests threats cachedRequests }
        dimensions { datetime }
      }
      httpRequests1dGroups(limit: 1, filter: { date_geq: $sinceDate }, orderBy: [date_DESC]) {
        uniq { uniques }
        dimensions { date }
      }
      httpRequestsAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: $since, requestSource: "eyeball" }
      ) {
        sum { visits }
      }
    }
  }
}`;

const ZONE_HOURLY_ROLLUP_QUERY = `query ($tag: string, $since: Time, $sinceDate: Date) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      zoneTag
      httpRequests1hGroups(limit: 72, filter: { datetime_geq: $since }, orderBy: [datetime_ASC]) {
        sum { requests threats cachedRequests }
        dimensions { datetime }
      }
      httpRequests1dGroups(limit: 1, filter: { date_geq: $sinceDate }, orderBy: [date_DESC]) {
        uniq { uniques }
        dimensions { date }
      }
    }
  }
}`;

export async function fetchZoneHourly(
  bearer: string,
  zoneId: string,
): Promise<ZoneHourlyAnalytics> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const vars = { tag: zoneId, since, sinceDate: utcDateString() };
  const zones = await runQuery(bearer, ZONE_HOURLY_QUERY, vars).catch(() =>
    runQuery(bearer, ZONE_HOURLY_ROLLUP_QUERY, vars),
  );

  let requests = 0;
  let threats = 0;
  let cachedRequests = 0;
  const series: { label: string; value: number }[] = [];
  for (const zone of zones) {
    for (const group of zone.httpRequests1hGroups ?? []) {
      requests += group.sum?.requests ?? 0;
      threats += group.sum?.threats ?? 0;
      cachedRequests += group.sum?.cachedRequests ?? 0;
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

  const first = zones[0];
  return {
    requests,
    threats,
    cachedRequests,
    uniques: first ? dailyUniques(first) : 0,
    visits: first ? eyeballVisits(first) : null,
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

// ── Account-level datasets (Workers / R2 / KV / D1) ────────────────────────

interface AccountGraphqlBody {
  data?: { viewer?: { accounts?: unknown[] } } | null;
  errors?: unknown[] | null;
}

async function runAccountQuery<T>(
  bearer: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T[]> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as AccountGraphqlBody;
  const accounts = body.data?.viewer?.accounts;
  if (!accounts) {
    const detail = JSON.stringify(body.errors ?? []).slice(0, 300);
    if (__DEV__) {
      console.warn('[analytics] account dataset unavailable:', detail);
    }
    throw new Error(`analytics-unavailable: ${detail}`);
  }
  return accounts as T[];
}

function last24hIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Expands a sparse hour->value map into a dense 24-point series so chart
 * spacing stays uniform. Keys must be ISO strings truncated to the hour
 * ("YYYY-MM-DDTHH").
 */
function fillHourlySeries(
  byHour: Map<string, number>,
): { label: string; value: number }[] {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const points: { label: string; value: number }[] = [];
  for (let i = 23; i >= 0; i -= 1) {
    const hour = new Date(now.getTime() - i * 3_600_000);
    points.push({
      label: String(hour.getUTCHours()).padStart(2, '0'),
      value: byHour.get(hour.toISOString().slice(0, 13)) ?? 0,
    });
  }
  return points;
}

/** Per-script Worker invocation totals over the last 24 hours. */
export interface WorkerMetrics {
  requests: number;
  errors: number;
  /** Median CPU time in milliseconds, or null when unavailable. */
  cpuP50Ms: number | null;
}

const WORKERS_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 500, filter: { datetime_geq: $since }) {
        sum { requests errors }
        quantiles { cpuTimeP50 }
        dimensions { scriptName }
      }
    }
  }
}`;

export async function fetchWorkerMetrics(
  bearer: string,
  accountId: string,
): Promise<Map<string, WorkerMetrics>> {
  const accounts = await runAccountQuery<{
    workersInvocationsAdaptive?: {
      sum?: { requests?: number; errors?: number };
      quantiles?: { cpuTimeP50?: number };
      dimensions?: { scriptName?: string };
    }[];
  }>(bearer, WORKERS_QUERY, { account: accountId, since: last24hIso() });

  const metrics = new Map<string, WorkerMetrics>();
  for (const account of accounts) {
    for (const group of account.workersInvocationsAdaptive ?? []) {
      const script = group.dimensions?.scriptName;
      if (!script) {
        continue;
      }
      const existing = metrics.get(script) ?? {
        requests: 0,
        errors: 0,
        cpuP50Ms: null,
      };
      existing.requests += group.sum?.requests ?? 0;
      existing.errors += group.sum?.errors ?? 0;
      const cpuMicros = group.quantiles?.cpuTimeP50;
      if (cpuMicros !== undefined && cpuMicros !== null) {
        existing.cpuP50Ms = Math.max(existing.cpuP50Ms ?? 0, cpuMicros / 1000);
      }
      metrics.set(script, existing);
    }
  }
  return metrics;
}

const WORKER_HOURLY_QUERY = `query ($account: string, $script: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 200, filter: { datetime_geq: $since, scriptName: $script }) {
        sum { requests }
        dimensions { datetimeHour }
      }
    }
  }
}`;

/** Hourly request series for one Worker script over the last 24 hours. */
export async function fetchWorkerHourlySeries(
  bearer: string,
  accountId: string,
  scriptName: string,
): Promise<{ label: string; value: number }[]> {
  const accounts = await runAccountQuery<{
    workersInvocationsAdaptive?: {
      sum?: { requests?: number };
      dimensions?: { datetimeHour?: string };
    }[];
  }>(bearer, WORKER_HOURLY_QUERY, {
    account: accountId,
    script: scriptName,
    since: last24hIso(),
  });

  const byHour = new Map<string, number>();
  let sawData = false;
  for (const account of accounts) {
    for (const group of account.workersInvocationsAdaptive ?? []) {
      const hour = group.dimensions?.datetimeHour;
      if (!hour) {
        continue;
      }
      sawData = true;
      const key = hour.slice(0, 13);
      byHour.set(key, (byHour.get(key) ?? 0) + (group.sum?.requests ?? 0));
    }
  }

  return sawData ? fillHourlySeries(byHour) : [];
}

/** Pages Functions invocation totals and hourly series, last 24 hours. */
export interface PagesFunctionMetrics {
  requests: number;
  errors: number;
  series: { label: string; value: number }[];
}

const PAGES_FUNCTIONS_QUERY = `query ($account: string, $script: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      pagesFunctionsInvocationsAdaptiveGroups(limit: 200, filter: { datetime_geq: $since, scriptName: $script }) {
        sum { requests errors }
        dimensions { datetimeHour }
      }
    }
  }
}`;

export async function fetchPagesFunctionMetrics(
  bearer: string,
  accountId: string,
  scriptName: string,
): Promise<PagesFunctionMetrics> {
  const accounts = await runAccountQuery<{
    pagesFunctionsInvocationsAdaptiveGroups?: {
      sum?: { requests?: number; errors?: number };
      dimensions?: { datetimeHour?: string };
    }[];
  }>(bearer, PAGES_FUNCTIONS_QUERY, {
    account: accountId,
    script: scriptName,
    since: last24hIso(),
  });

  let requests = 0;
  let errors = 0;
  const byHour = new Map<string, number>();
  for (const account of accounts) {
    for (const group of account.pagesFunctionsInvocationsAdaptiveGroups ??
      []) {
      const groupRequests = group.sum?.requests ?? 0;
      requests += groupRequests;
      errors += group.sum?.errors ?? 0;
      const hour = group.dimensions?.datetimeHour;
      if (hour) {
        const key = hour.slice(0, 13);
        byHour.set(key, (byHour.get(key) ?? 0) + groupRequests);
      }
    }
  }

  return {
    requests,
    errors,
    series: byHour.size > 0 ? fillHourlySeries(byHour) : [],
  };
}

export interface R2BucketMetrics {
  objectCount: number;
  payloadSize: number;
  classAOps: number;
  classBOps: number;
}

export interface KvNamespaceMetrics {
  keyCount: number;
  byteCount: number;
  reads: number;
  writes: number;
}

export interface D1DatabaseMetrics {
  readQueries: number;
  writeQueries: number;
}

/** Metrics for every storage product of one account, keyed by resource id. */
export interface StorageMetrics {
  /** Keyed by bucket name. */
  r2: Map<string, R2BucketMetrics>;
  /** Keyed by namespace id. */
  kv: Map<string, KvNamespaceMetrics>;
  /** Keyed by database uuid. */
  d1: Map<string, D1DatabaseMetrics>;
}

const R2_STORAGE_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      r2StorageAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        max { objectCount payloadSize }
        dimensions { bucketName }
      }
    }
  }
}`;

const R2_OPS_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      r2OperationsAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        sum { requests }
        dimensions { bucketName actionType }
      }
    }
  }
}`;

const KV_STORAGE_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      kvStorageAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        max { keyCount byteCount }
        dimensions { namespaceId }
      }
    }
  }
}`;

const KV_OPS_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      kvOperationsAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        sum { requests }
        dimensions { namespaceId actionType }
      }
    }
  }
}`;

const D1_QUERY = `query ($account: string, $since: Time) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      d1AnalyticsAdaptiveGroups(limit: 500, filter: { datetime_geq: $since }) {
        sum { readQueries writeQueries }
        dimensions { databaseId }
      }
    }
  }
}`;

/** R2 billing classes: class A mutates/lists, everything else is class B. */
const R2_CLASS_A_ACTIONS = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
]);

/**
 * Storage metrics for one account over the last 24 hours. Every dataset is
 * fetched independently and failures simply leave that map empty, so plans
 * or tokens without a given product still render the rest.
 */
export async function fetchStorageMetrics(
  bearer: string,
  accountId: string,
): Promise<StorageMetrics> {
  const since = last24hIso();
  const variables = { account: accountId, since };
  const metrics: StorageMetrics = {
    r2: new Map(),
    kv: new Map(),
    d1: new Map(),
  };

  const r2Bucket = (name: string): R2BucketMetrics => {
    const existing = metrics.r2.get(name) ?? {
      objectCount: 0,
      payloadSize: 0,
      classAOps: 0,
      classBOps: 0,
    };
    metrics.r2.set(name, existing);
    return existing;
  };
  const kvNamespace = (id: string): KvNamespaceMetrics => {
    const existing = metrics.kv.get(id) ?? {
      keyCount: 0,
      byteCount: 0,
      reads: 0,
      writes: 0,
    };
    metrics.kv.set(id, existing);
    return existing;
  };

  await Promise.all([
    runAccountQuery<{
      r2StorageAdaptiveGroups?: {
        max?: { objectCount?: number; payloadSize?: number };
        dimensions?: { bucketName?: string };
      }[];
    }>(bearer, R2_STORAGE_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.r2StorageAdaptiveGroups ?? []) {
            const name = group.dimensions?.bucketName;
            if (!name) {
              continue;
            }
            const bucket = r2Bucket(name);
            bucket.objectCount = Math.max(
              bucket.objectCount,
              group.max?.objectCount ?? 0,
            );
            bucket.payloadSize = Math.max(
              bucket.payloadSize,
              group.max?.payloadSize ?? 0,
            );
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      r2OperationsAdaptiveGroups?: {
        sum?: { requests?: number };
        dimensions?: { bucketName?: string; actionType?: string };
      }[];
    }>(bearer, R2_OPS_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.r2OperationsAdaptiveGroups ?? []) {
            const name = group.dimensions?.bucketName;
            if (!name) {
              continue;
            }
            const bucket = r2Bucket(name);
            const requests = group.sum?.requests ?? 0;
            if (R2_CLASS_A_ACTIONS.has(group.dimensions?.actionType ?? '')) {
              bucket.classAOps += requests;
            } else {
              bucket.classBOps += requests;
            }
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      kvStorageAdaptiveGroups?: {
        max?: { keyCount?: number; byteCount?: number };
        dimensions?: { namespaceId?: string };
      }[];
    }>(bearer, KV_STORAGE_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.kvStorageAdaptiveGroups ?? []) {
            const id = group.dimensions?.namespaceId;
            if (!id) {
              continue;
            }
            const namespace = kvNamespace(id);
            namespace.keyCount = Math.max(
              namespace.keyCount,
              group.max?.keyCount ?? 0,
            );
            namespace.byteCount = Math.max(
              namespace.byteCount,
              group.max?.byteCount ?? 0,
            );
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      kvOperationsAdaptiveGroups?: {
        sum?: { requests?: number };
        dimensions?: { namespaceId?: string; actionType?: string };
      }[];
    }>(bearer, KV_OPS_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.kvOperationsAdaptiveGroups ?? []) {
            const id = group.dimensions?.namespaceId;
            if (!id) {
              continue;
            }
            const namespace = kvNamespace(id);
            const requests = group.sum?.requests ?? 0;
            if (group.dimensions?.actionType === 'read') {
              namespace.reads += requests;
            } else {
              namespace.writes += requests;
            }
          }
        }
      })
      .catch(() => {}),
    runAccountQuery<{
      d1AnalyticsAdaptiveGroups?: {
        sum?: { readQueries?: number; writeQueries?: number };
        dimensions?: { databaseId?: string };
      }[];
    }>(bearer, D1_QUERY, variables)
      .then((accounts) => {
        for (const account of accounts) {
          for (const group of account.d1AnalyticsAdaptiveGroups ?? []) {
            const id = group.dimensions?.databaseId;
            if (!id) {
              continue;
            }
            const existing = metrics.d1.get(id) ?? {
              readQueries: 0,
              writeQueries: 0,
            };
            existing.readQueries += group.sum?.readQueries ?? 0;
            existing.writeQueries += group.sum?.writeQueries ?? 0;
            metrics.d1.set(id, existing);
          }
        }
      })
      .catch(() => {}),
  ]);

  return metrics;
}
