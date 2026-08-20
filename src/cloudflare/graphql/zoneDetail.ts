import { dailyUniques, eyeballVisits, runQuery, utcDateString } from './client';

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

/** Daily breakdown for a single zone over an arbitrary window (7d / 30d). */
export interface ZoneDailyAnalytics {
  requests: number;
  threats: number;
  cachedRequests: number;
  bytes: number;
  cachedBytes: number;
  uniques: number;
  /** 0–100, or null when the zone served no requests in the window. */
  cacheRatioPct: number | null;
  /** Daily request series, oldest first, labelled "M/D". */
  series: { label: string; value: number }[];
}

const ZONE_DAILY_QUERY = `query ($tag: string, $since: Date) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      zoneTag
      httpRequests1dGroups(limit: 60, filter: { date_geq: $since }, orderBy: [date_ASC]) {
        sum { requests threats cachedRequests bytes cachedBytes }
        uniq { uniques }
        dimensions { date }
      }
    }
  }
}`;

export async function fetchZoneDaily(
  bearer: string,
  zoneId: string,
  days: number,
): Promise<ZoneDailyAnalytics> {
  const since = utcDateString(days - 1);
  const zones = await runQuery(bearer, ZONE_DAILY_QUERY, { tag: zoneId, since });

  let requests = 0;
  let threats = 0;
  let cachedRequests = 0;
  let bytes = 0;
  let cachedBytes = 0;
  let uniques = 0;
  const series: { label: string; value: number }[] = [];
  for (const zone of zones) {
    for (const group of zone.httpRequests1dGroups ?? []) {
      requests += group.sum?.requests ?? 0;
      threats += group.sum?.threats ?? 0;
      cachedRequests += group.sum?.cachedRequests ?? 0;
      bytes += group.sum?.bytes ?? 0;
      cachedBytes += group.sum?.cachedBytes ?? 0;
      uniques += group.uniq?.uniques ?? 0;
      const date = group.dimensions?.date;
      if (date) {
        const parsed = new Date(`${date}T00:00:00Z`);
        series.push({
          label: `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}`,
          value: group.sum?.requests ?? 0,
        });
      }
    }
  }

  return {
    requests,
    threats,
    cachedRequests,
    bytes,
    cachedBytes,
    uniques,
    cacheRatioPct:
      requests > 0 ? Math.round((cachedRequests / requests) * 100) : null,
    series,
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
