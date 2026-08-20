import { CloudflareApiError } from '../rest/client';

export const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

/** Cloudflare GraphQL rejects queries covering more than ~10 zones. */
export const ZONES_PER_QUERY = 10;

/**
 * Queries in flight per credential. Zone lists are chunked ten at a time, so
 * an account with a few hundred zones would otherwise fire dozens of parallel
 * queries at the analytics API; the rate limit it hits back with is swallowed
 * by the best-effort callers and shows up as silently missing charts.
 */
export const QUERY_CONCURRENCY = 4;

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
  data?: { viewer?: Record<string, unknown[] | undefined> | null } | null;
  errors?: { message?: string }[] | null;
}

/**
 * The analytics API answers 200 with an `errors` array, so a token without the
 * analytics scope arrives looking like any other query failure. Recognising it
 * is what lets the UI prompt for a re-authorization instead of blaming the
 * network.
 */
const PERMISSION_MESSAGE =
  /unauthor|not authenticated|forbidden|permission|access denied|authentication error/i;

/**
 * Posts a GraphQL query and returns one `viewer` collection.
 *
 * Failures map onto the same `CloudflareApiError` codes the REST client uses:
 * without that, a dropped connection, a gateway error page and a missing scope
 * all reached the UI as untyped `Error`s and rendered the same generic message.
 */
async function runViewerQuery<T>(
  bearer: string,
  query: string,
  variables: Record<string, unknown>,
  field: string,
): Promise<T[]> {
  let response: Response;
  try {
    response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new CloudflareApiError('network');
  }

  if (response.status === 401) {
    throw new CloudflareApiError('invalid-token');
  }
  if (response.status === 403) {
    throw new CloudflareApiError('forbidden');
  }

  let body: GraphqlBody;
  try {
    body = (await response.json()) as GraphqlBody;
  } catch {
    // An edge error page rather than a GraphQL response.
    throw new CloudflareApiError('api');
  }

  const collection = body.data?.viewer?.[field];
  if (!collection) {
    const detail = (body.errors ?? [])
      .map((error) => error.message)
      .filter((message): message is string => Boolean(message))
      .join('; ')
      .slice(0, 300);
    if (__DEV__) {
      console.warn(`[analytics] ${field} unavailable:`, detail);
    }
    throw new CloudflareApiError(
      PERMISSION_MESSAGE.test(detail) ? 'forbidden' : 'api',
      detail || undefined,
    );
  }
  return collection as T[];
}

/** Runs a zone-scoped GraphQL query and returns the raw zone groups. */
export function runQuery(
  bearer: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<RawZone[]> {
  return runViewerQuery<RawZone>(bearer, query, variables, 'zones');
}

/** Runs an account-scoped GraphQL query and returns the raw account groups. */
export function runAccountQuery<T>(
  bearer: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T[]> {
  return runViewerQuery<T>(bearer, query, variables, 'accounts');
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
