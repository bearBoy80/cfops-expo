import {
  aggregateAnalytics,
  fetchAnalyticsSnapshot,
  fetchStorageMetrics,
  fetchWorkerMetrics,
  invalidateAnalyticsSnapshot,
  invalidateStorageMetrics,
  invalidateWorkerMetrics,
  invalidateZonesRangeSnapshot,
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
          httpRequests1dGroups: [
            {
              uniq: { uniques: 90 },
              sum: { pageViews: 200 },
              dimensions: { date: '2026-08-14' },
            },
          ],
          httpRequestsAdaptiveGroups: [{ sum: { visits: 70 } }],
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
  invalidateZonesRangeSnapshot();
  invalidateWorkerMetrics();
  invalidateStorageMetrics();
  listConnections.mockResolvedValue([
    { id: 'tok-1', label: 'Ops token', authType: 'token', accounts: [] },
  ]);
  getConnectionBearer.mockResolvedValue('bearer-1');
});

const setFetch = (mock: jest.Mock) => {
  (globalThis as { fetch: unknown }).fetch = mock;
  return mock;
};

const queryOf = (init: { body?: string } | undefined): string => {
  if (!init?.body) {
    return '';
  }
  try {
    return (JSON.parse(init.body) as { query?: string }).query ?? '';
  } catch {
    return '';
  }
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
    uniques: 90,
    visits: null,
    pageViews: null,
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
    jest.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
      const query = queryOf(init);
      if (query.includes('firewallEventsAdaptive')) {
        return { json: () => Promise.resolve({ data: null, errors: [{}] }) };
      }
      return { json: () => Promise.resolve(trafficOnly) };
    }),
  );

  const snapshot = await fetchAnalyticsSnapshot(zonesSnapshot);

  expect(mockFetch).toHaveBeenCalled();
  expect(snapshot.available).toBe(true);
  expect(snapshot.zones[0].requests).toBe(400);
  expect(snapshot.events).toEqual([]);
});

test('overlays Web Analytics visits grouped by requestHost', async () => {
  setFetch(
    jest.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
      const query = queryOf(init);
      if (query.includes('rumPageloadEventsAdaptiveGroups')) {
        return {
          json: () =>
            Promise.resolve({
              data: {
                viewer: {
                  accounts: [
                    {
                      rumPageloadEventsAdaptiveGroups: [
                        {
                          count: 1800,
                          sum: { visits: 1760 },
                          dimensions: { requestHost: 'www.acme.com' },
                        },
                      ],
                    },
                  ],
                },
              },
            }),
        };
      }
      return { json: () => Promise.resolve(graphqlPayload) };
    }),
  );

  const snapshot = await fetchAnalyticsSnapshot(zonesSnapshot);

  expect(snapshot.zones[0].visits).toBe(1760);
  expect(snapshot.zones[0].pageViews).toBe(1800);
  expect(snapshot.zones[0].uniques).toBe(90);
});

test('rolls subdomain Web Analytics hosts into the apex zone', async () => {
  setFetch(
    jest.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
      const query = queryOf(init);
      if (query.includes('rumPageloadEventsAdaptiveGroups')) {
        return {
          json: () =>
            Promise.resolve({
              data: {
                viewer: {
                  accounts: [
                    {
                      rumPageloadEventsAdaptiveGroups: [
                        {
                          count: 120,
                          sum: { visits: 118 },
                          dimensions: { requestHost: 'figma.acme.com' },
                        },
                        {
                          count: 6,
                          sum: { visits: 6 },
                          dimensions: { requestHost: 'acme.com' },
                        },
                      ],
                    },
                  ],
                },
              },
            }),
        };
      }
      return { json: () => Promise.resolve(graphqlPayload) };
    }),
  );

  const snapshot = await fetchAnalyticsSnapshot(zonesSnapshot);

  expect(snapshot.zones[0].visits).toBe(124);
  expect(snapshot.zones[0].pageViews).toBe(126);
});

test('keeps HTTP uniques internal and leaves visits empty without RUM', async () => {
  setFetch(
    jest.fn().mockResolvedValue({
      json: () => Promise.resolve(graphqlPayload),
    }),
  );

  const snapshot = await fetchAnalyticsSnapshot(zonesSnapshot);

  expect(snapshot.zones[0].uniques).toBe(90);
  expect(snapshot.zones[0].visits).toBeNull();
  expect(snapshot.zones[0].pageViews).toBeNull();
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
        uniques: 120,
        visits: 70,
        pageViews: 80,
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
        uniques: 12,
        visits: 8,
        pageViews: 10,
        series: [{ datetime: '2026-08-13T02:00:00Z', requests: 50 }],
      },
    ],
    events: [],
  };

  const all = aggregateAnalytics(snapshot);
  expect(all.requests).toBe(450);
  expect(all.uniques).toBe(132);
  expect(all.visits).toBe(78);
  expect(all.series).toEqual([
    { label: '01', value: 100 },
    { label: '02', value: 350 },
  ]);

  const scoped = aggregateAnalytics(snapshot, 'acc-2');
  expect(scoped.requests).toBe(50);
  expect(scoped.series).toEqual([{ label: '02', value: 50 }]);
});

test('fetchWorkerMetrics sums invocations per script', async () => {
  setFetch(
    jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [
                    {
                      sum: { requests: 100, errors: 2 },
                      quantiles: { cpuTimeP50: 3200 },
                      dimensions: { scriptName: 'api-gateway' },
                    },
                    {
                      sum: { requests: 50, errors: 0 },
                      quantiles: { cpuTimeP50: 1000 },
                      dimensions: { scriptName: 'api-gateway' },
                    },
                  ],
                },
              ],
            },
          },
        }),
    }),
  );

  const metrics = await fetchWorkerMetrics('bearer-1', 'acc-1');

  expect(metrics.get('api-gateway')).toEqual({
    requests: 150,
    errors: 2,
    cpuP50Ms: 3.2,
  });
});

test('worker metrics are cached per account until invalidated', async () => {
  const fetchMock = setFetch(
    jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } },
        }),
    }),
  );

  await fetchWorkerMetrics('bearer-1', 'acc-1');
  await fetchWorkerMetrics('bearer-1', 'acc-1');
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // A different account must not read the first account's entry.
  await fetchWorkerMetrics('bearer-1', 'acc-2');
  expect(fetchMock).toHaveBeenCalledTimes(2);

  invalidateWorkerMetrics('acc-1');
  await fetchWorkerMetrics('bearer-1', 'acc-1');
  expect(fetchMock).toHaveBeenCalledTimes(3);

  // The untouched account is still served from cache.
  await fetchWorkerMetrics('bearer-1', 'acc-2');
  expect(fetchMock).toHaveBeenCalledTimes(3);

  invalidateWorkerMetrics();
  await fetchWorkerMetrics('bearer-1', 'acc-2');
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test('fetchStorageMetrics collects R2, KV and D1 datasets independently', async () => {
  const respond = (body: unknown) => ({
    json: () => Promise.resolve(body),
  });
  const account = (fields: Record<string, unknown>) =>
    respond({ data: { viewer: { accounts: [fields] } } });

  setFetch(
    jest.fn().mockImplementation((_url: string, init: { body: string }) => {
      const query = (JSON.parse(init.body) as { query: string }).query;
      if (query.includes('r2StorageAdaptiveGroups')) {
        return Promise.resolve(
          account({
            r2StorageAdaptiveGroups: [
              {
                max: { objectCount: 12, payloadSize: 2048 },
                dimensions: { bucketName: 'assets' },
              },
            ],
          }),
        );
      }
      if (query.includes('r2OperationsAdaptiveGroups')) {
        return Promise.resolve(
          account({
            r2OperationsAdaptiveGroups: [
              {
                sum: { requests: 10 },
                dimensions: { bucketName: 'assets', actionType: 'PutObject' },
              },
              {
                sum: { requests: 90 },
                dimensions: { bucketName: 'assets', actionType: 'GetObject' },
              },
            ],
          }),
        );
      }
      if (query.includes('kvStorageAdaptiveGroups')) {
        return Promise.resolve(
          account({
            kvStorageAdaptiveGroups: [
              {
                max: { keyCount: 42, byteCount: 512 },
                dimensions: { namespaceId: 'ns-1' },
              },
            ],
          }),
        );
      }
      if (query.includes('kvOperationsAdaptiveGroups')) {
        return Promise.resolve(
          account({
            kvOperationsAdaptiveGroups: [
              {
                sum: { requests: 30 },
                dimensions: { namespaceId: 'ns-1', actionType: 'read' },
              },
              {
                sum: { requests: 5 },
                dimensions: { namespaceId: 'ns-1', actionType: 'write' },
              },
            ],
          }),
        );
      }
      // D1 dataset fails: the rest must still be returned.
      return Promise.resolve(respond({ data: null, errors: [{}] }));
    }),
  );

  const metrics = await fetchStorageMetrics('bearer-1', 'acc-1');

  expect(metrics.r2.get('assets')).toEqual({
    objectCount: 12,
    payloadSize: 2048,
    classAOps: 10,
    classBOps: 90,
  });
  expect(metrics.kv.get('ns-1')).toEqual({
    keyCount: 42,
    byteCount: 512,
    reads: 30,
    writes: 5,
  });
  expect(metrics.d1.size).toBe(0);
});

test('storage metrics are cached per account until invalidated', async () => {
  const fetchMock = setFetch(
    jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: { viewer: { accounts: [{}] } } }),
    }),
  );

  await fetchStorageMetrics('bearer-1', 'acc-1');
  // One fetch per dataset; the exact count is an implementation detail.
  const perAccount = fetchMock.mock.calls.length;
  expect(perAccount).toBeGreaterThan(0);

  await fetchStorageMetrics('bearer-1', 'acc-1');
  expect(fetchMock).toHaveBeenCalledTimes(perAccount);

  invalidateStorageMetrics('acc-1');
  await fetchStorageMetrics('bearer-1', 'acc-1');
  expect(fetchMock).toHaveBeenCalledTimes(perAccount * 2);
});

describe('graphql failures carry a translatable code', () => {
  test('an unreachable endpoint is a network failure', async () => {
    setFetch(jest.fn().mockRejectedValue(new TypeError('Network request failed')));

    await expect(
      fetchWorkerMetrics('bearer-1', 'acc-1'),
    ).rejects.toMatchObject({ code: 'network' });
  });

  test('a rejected status maps to the matching code', async () => {
    setFetch(
      jest.fn().mockResolvedValue({
        status: 403,
        json: () => Promise.resolve({}),
      }),
    );

    await expect(
      fetchWorkerMetrics('bearer-1', 'acc-1'),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  test('a missing analytics scope reads as forbidden, not as an outage', async () => {
    // The analytics API answers 200 with an errors array, so the message is
    // the only thing that distinguishes a scope problem from a real failure.
    setFetch(
      jest.fn().mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({
            data: null,
            errors: [{ message: 'unauthorized to access this dataset' }],
          }),
      }),
    );

    await expect(
      fetchWorkerMetrics('bearer-1', 'acc-1'),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  test('an edge error page is an api failure rather than a crash', async () => {
    setFetch(
      jest.fn().mockResolvedValue({
        status: 502,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      }),
    );

    await expect(
      fetchWorkerMetrics('bearer-1', 'acc-1'),
    ).rejects.toMatchObject({ code: 'api' });
  });
});
