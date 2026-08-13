import {
  aggregateAnalytics,
  fetchAnalyticsSnapshot,
  invalidateAnalyticsSnapshot,
  type AnalyticsSnapshot,
} from '../analytics';
import type { ZonesSnapshot } from '../resources';

jest.mock('../connections', () => ({
  listConnections: jest.fn(),
}));

jest.mock('../resources', () => ({
  getConnectionBearer: jest.fn(),
}));

const { listConnections } = jest.requireMock<{
  listConnections: jest.Mock;
}>('../connections');
const { getConnectionBearer } = jest.requireMock<{
  getConnectionBearer: jest.Mock;
}>('../resources');

const zonesSnapshot: ZonesSnapshot = {
  connectionCount: 1,
  zones: [
    {
      id: 'zone-1',
      name: 'acme.com',
      status: 'active',
      paused: false,
      plan: 'Enterprise',
      accountId: 'acc-1',
      accountName: 'Acme Corp',
      nameServers: [],
      connectionId: 'tok-1',
    },
  ],
  accounts: [{ id: 'acc-1', name: 'Acme Corp', zoneCount: 1 }],
  issues: [],
};

const graphqlPayload = {
  data: {
    viewer: {
      zones: [
        {
          zoneTag: 'zone-1',
          httpRequests1hGroups: [
            {
              sum: { requests: 100, threats: 5, bytes: 2048, cachedBytes: 1024 },
              dimensions: { datetime: '2026-08-13T01:00:00Z' },
            },
            {
              sum: { requests: 300, threats: 1, bytes: 4096, cachedBytes: 2048 },
              dimensions: { datetime: '2026-08-13T02:00:00Z' },
            },
          ],
          firewallEventsAdaptive: [
            {
              action: 'block',
              ruleId: 'WAF-1',
              clientIP: '1.2.3.4',
              clientCountryName: 'US',
              datetime: '2026-08-13T02:30:00Z',
            },
          ],
        },
      ],
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  invalidateAnalyticsSnapshot();
  listConnections.mockResolvedValue([
    { id: 'tok-1', label: 'Ops token', authType: 'token', accounts: [] },
  ]);
  getConnectionBearer.mockResolvedValue('bearer-1');
});

const setFetch = (mock: jest.Mock) => {
  (globalThis as { fetch: unknown }).fetch = mock;
  return mock;
};

test('fetches zone analytics and firewall events over GraphQL', async () => {
  setFetch(
    jest.fn().mockResolvedValue({
      json: () => Promise.resolve(graphqlPayload),
    }),
  );

  const snapshot = await fetchAnalyticsSnapshot(zonesSnapshot);

  expect(snapshot.available).toBe(true);
  expect(snapshot.zones).toHaveLength(1);
  expect(snapshot.zones[0]).toMatchObject({
    zoneId: 'zone-1',
    accountId: 'acc-1',
    requests: 400,
    threats: 6,
    bytes: 6144,
    cachedBytes: 3072,
  });
  expect(snapshot.events).toEqual([
    {
      zoneId: 'zone-1',
      accountId: 'acc-1',
      action: 'block',
      ruleId: 'WAF-1',
      clientIP: '1.2.3.4',
      country: 'US',
      datetime: '2026-08-13T02:30:00Z',
    },
  ]);
});

test('falls back to traffic-only query when firewall data is denied', async () => {
  const trafficOnly = {
    data: {
      viewer: {
        zones: [
          {
            zoneTag: 'zone-1',
            httpRequests1hGroups:
              graphqlPayload.data.viewer.zones[0].httpRequests1hGroups,
          },
        ],
      },
    },
  };
  const mockFetch = setFetch(
    jest
      .fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ data: null, errors: [{}] }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve(trafficOnly),
      }),
  );

  const snapshot = await fetchAnalyticsSnapshot(zonesSnapshot);

  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(snapshot.available).toBe(true);
  expect(snapshot.zones[0].requests).toBe(400);
  expect(snapshot.events).toEqual([]);
});

test('reports unavailable analytics when every connection fails', async () => {
  setFetch(
    jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: null, errors: [{}] }),
    }),
  );

  const snapshot = await fetchAnalyticsSnapshot(zonesSnapshot);

  expect(snapshot.available).toBe(false);
  expect(snapshot.zones).toEqual([]);
});

test('aggregates totals and the hourly series, optionally per account', () => {
  const snapshot: AnalyticsSnapshot = {
    available: true,
    zones: [
      {
        zoneId: 'zone-1',
        accountId: 'acc-1',
        requests: 400,
        threats: 6,
        bytes: 6144,
        cachedBytes: 3072,
        series: [
          { datetime: '2026-08-13T01:00:00Z', requests: 100 },
          { datetime: '2026-08-13T02:00:00Z', requests: 300 },
        ],
      },
      {
        zoneId: 'zone-2',
        accountId: 'acc-2',
        requests: 50,
        threats: 0,
        bytes: 100,
        cachedBytes: 10,
        series: [{ datetime: '2026-08-13T02:00:00Z', requests: 50 }],
      },
    ],
    events: [],
  };

  const all = aggregateAnalytics(snapshot);
  expect(all.requests).toBe(450);
  expect(all.series).toEqual([
    { label: '01', value: 100 },
    { label: '02', value: 350 },
  ]);

  const scoped = aggregateAnalytics(snapshot, 'acc-2');
  expect(scoped.requests).toBe(50);
  expect(scoped.series).toEqual([{ label: '02', value: 50 }]);
});
