import { mapLimit } from '../../utils/concurrency';
import { listConnections } from '../connections';
import {
  getConnectionBearer,
  type ZoneListItem,
  type ZonesSnapshot,
} from '../resources';
import { createKeyedTtlCache } from '../ttlCache';
import {
  QUERY_CONCURRENCY,
  ZONES_PER_QUERY,
  runQuery,
  utcDateString,
  type RawZone,
} from './client';

// ── Multi-day traffic (7d / 30d) ───────────────────────────────────────────

export interface RangeZoneTraffic {
  zoneId: string;
  accountId: string;
  requests: number;
  threats: number;
  bytes: number;
  cachedBytes: number;
  /** Daily request buckets, oldest first, keyed by UTC date (YYYY-MM-DD). */
  series: { date: string; requests: number }[];
}

export interface RangeTrafficSnapshot {
  /** False when no connected credential could read daily analytics. */
  available: boolean;
  /** Window length in days that produced this snapshot. */
  days: number;
  zones: RangeZoneTraffic[];
}

export interface AggregatedRange {
  requests: number;
  threats: number;
  bytes: number;
  cachedBytes: number;
  /** Daily request series, oldest first, labelled "M/D". */
  series: { label: string; value: number }[];
}

const ZONES_DAILY_QUERY = `query ($tags: [string!], $since: Date) {
  viewer {
    zones(filter: { zoneTag_in: $tags }) {
      zoneTag
      httpRequests1dGroups(limit: 60, filter: { date_geq: $since }, orderBy: [date_ASC]) {
        sum { requests threats bytes cachedBytes }
        dimensions { date }
      }
    }
  }
}`;

async function fetchRangeSnapshot(
  zonesSnapshot: ZonesSnapshot,
  days: number,
): Promise<RangeTrafficSnapshot> {
  const since = utcDateString(days - 1);
  const zonesByConnection = new Map<string, ZoneListItem[]>();
  for (const zone of zonesSnapshot.zones) {
    const list = zonesByConnection.get(zone.connectionId) ?? [];
    list.push(zone);
    zonesByConnection.set(zone.connectionId, list);
  }

  const connections = await listConnections();
  const zones: RangeZoneTraffic[] = [];

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
        const accountByZone = new Map(
          list.map((zone) => [zone.id, zone.accountId]),
        );
        const chunks: string[][] = [];
        for (let i = 0; i < list.length; i += ZONES_PER_QUERY) {
          chunks.push(list.slice(i, i + ZONES_PER_QUERY).map((zone) => zone.id));
        }
        const raw: RawZone[] = (
          await mapLimit(chunks, QUERY_CONCURRENCY, (tags) =>
            runQuery(bearer, ZONES_DAILY_QUERY, { tags, since }),
          )
        ).flat();

        for (const zone of raw) {
          if (!zone.zoneTag) {
            continue;
          }
          const groups = zone.httpRequests1dGroups ?? [];
          zones.push({
            zoneId: zone.zoneTag,
            accountId: accountByZone.get(zone.zoneTag) ?? '',
            requests: groups.reduce((s, g) => s + (g.sum?.requests ?? 0), 0),
            threats: groups.reduce((s, g) => s + (g.sum?.threats ?? 0), 0),
            bytes: groups.reduce((s, g) => s + (g.sum?.bytes ?? 0), 0),
            cachedBytes: groups.reduce(
              (s, g) => s + (g.sum?.cachedBytes ?? 0),
              0,
            ),
            series: groups
              .filter((g) => g.dimensions?.date)
              .map((g) => ({
                date: g.dimensions?.date ?? '',
                requests: g.sum?.requests ?? 0,
              })),
          });
        }
      } catch (cause) {
        if (__DEV__) {
          console.warn('[analytics] range connection skipped:', cause);
        }
      }
    }),
  );

  return { available: zones.length > 0, days, zones };
}

/**
 * Sums daily zone traffic into totals and a per-day request series.
 * Pass an accountId to scope the aggregate to a single Cloudflare account.
 */
export function aggregateRange(
  snapshot: RangeTrafficSnapshot,
  accountId?: string,
): AggregatedRange {
  const zones = accountId
    ? snapshot.zones.filter((zone) => zone.accountId === accountId)
    : snapshot.zones;

  const byDate = new Map<string, number>();
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
      byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.requests);
    }
  }

  const series = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => {
      const parsed = new Date(`${date}T00:00:00Z`);
      return {
        label: `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}`,
        value,
      };
    });

  return { requests, threats, bytes, cachedBytes, series };
}

const RANGE_TTL_MS = 300_000;

const rangeCache = createKeyedTtlCache<
  RangeTrafficSnapshot,
  string,
  [ZonesSnapshot, number]
>(RANGE_TTL_MS, (_key, zonesSnapshot, days) =>
  fetchRangeSnapshot(zonesSnapshot, days),
);

/**
 * The zone set is part of the key, not just an input.
 *
 * An aggregate computed over a different set of zones is a different result, so
 * keying on the window alone meant every path that adds or removes a zone had
 * to remember to invalidate by hand — and a five-minute-stale total that still
 * counts a deleted zone is indistinguishable from a correct one.
 */
function rangeKey(zonesSnapshot: ZonesSnapshot, days: number): string {
  const zoneIds = zonesSnapshot.zones
    .map((zone) => zone.id)
    .sort()
    .join(',');
  return `${days}:${zoneIds}`;
}

export function fetchZonesRangeSnapshot(
  zonesSnapshot: ZonesSnapshot,
  days: number,
  options?: { force?: boolean },
): Promise<RangeTrafficSnapshot> {
  return rangeCache.get(
    rangeKey(zonesSnapshot, days),
    options,
    zonesSnapshot,
    days,
  );
}

/** Drops every cached range window. */
export function invalidateZonesRangeSnapshot(): void {
  rangeCache.invalidate();
}
