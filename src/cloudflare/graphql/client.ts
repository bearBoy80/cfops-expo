export const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

/** Cloudflare GraphQL rejects queries covering more than ~10 zones. */
export const ZONES_PER_QUERY = 10;

export interface RawHourGroup {
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

export interface RawFirewallEvent {
  action?: string;
  ruleId?: string;
  clientIP?: string;
  clientCountryName?: string;
  clientRequestPath?: string;
  datetime?: string;
}

export interface RawZone {
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

/** Runs a zone-scoped GraphQL query and returns the raw zone groups. */
export async function runQuery(
  bearer: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<RawZone[]> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer.trim()}`,
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

interface AccountGraphqlBody {
  data?: { viewer?: { accounts?: unknown[] } } | null;
  errors?: unknown[] | null;
}

/** Runs an account-scoped GraphQL query and returns the raw account groups. */
export async function runAccountQuery<T>(
  bearer: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T[]> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer.trim()}`,
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

export function utcDateString(daysAgo = 0): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function last24hIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export function dailyUniques(zone: RawZone): number {
  const groups = zone.httpRequests1dGroups ?? [];
  const today = utcDateString();
  const match =
    groups.find((group) => group.dimensions?.date === today) ?? groups[0];
  return match?.uniq?.uniques ?? 0;
}

export function eyeballVisits(zone: RawZone): number | null {
  if (!zone.httpRequestsAdaptiveGroups) {
    return null;
  }
  return zone.httpRequestsAdaptiveGroups.reduce(
    (sum, group) => sum + (group.sum?.visits ?? 0),
    0,
  );
}

/**
 * Expands a sparse hour->value map into a dense 24-point series so chart
 * spacing stays uniform. Keys must be ISO strings truncated to the hour
 * ("YYYY-MM-DDTHH").
 */
export function fillHourlySeries(
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
