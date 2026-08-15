import {
  fetchAlertsSnapshot,
  fetchAuditSnapshot,
  fetchBillingSnapshot,
  fetchLoadBalancingSnapshot,
  groupSubscriptions,
} from '../management';
import {
  CloudflareApiError,
  listAlertHistory,
  listAuditLogs,
  listLoadBalancerPools,
  listLoadBalancers,
  listSubscriptions,
  listZoneLoadBalancers,
} from '../api';
import { listConnections } from '../connections';
import { fetchZonesSnapshot, getConnectionBearer } from '../resources';

jest.mock('../connections', () => ({
  listConnections: jest.fn(),
}));

jest.mock('../resources', () => ({
  getConnectionBearer: jest.fn(),
  fetchZonesSnapshot: jest.fn(),
}));

jest.mock('../api', () => {
  const actual = jest.requireActual<typeof import('../api')>('../api');
  return {
    ...actual,
    listAlertHistory: jest.fn(),
    listAuditLogs: jest.fn(),
    listLoadBalancers: jest.fn(),
    listLoadBalancerPools: jest.fn(),
    listZoneLoadBalancers: jest.fn(),
    listSubscriptions: jest.fn(),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listConnections).mockResolvedValue([
    {
      id: 'tok-1',
      label: 'Ops',
      authType: 'token',
      accounts: [{ id: 'acc-1', name: 'Acme Corp' }],
      createdAt: 0,
    },
  ]);
  jest.mocked(getConnectionBearer).mockResolvedValue('bearer-1');
});

test('aggregates alert history onto accounts', async () => {
  jest.mocked(listAlertHistory).mockResolvedValue([
    {
      id: 'n-1',
      title: 'SSL Notification',
      detail: 'expired',
      type: 'universal_ssl_event_type',
      sent: '2026-08-14T01:00:00Z',
    },
  ]);

  const snapshot = await fetchAlertsSnapshot();
  expect(snapshot.alerts[0]).toMatchObject({
    id: 'n-1',
    accountId: 'acc-1',
    accountName: 'Acme Corp',
  });
});

test('attaches pools to load balancers', async () => {
  jest.mocked(listLoadBalancers).mockResolvedValue([
    {
      id: 'lb-1',
      name: 'api.acme.com',
      enabled: true,
      steering: 'geo',
      poolIds: ['pool-1'],
    },
  ]);
  jest.mocked(listLoadBalancerPools).mockResolvedValue([
    {
      id: 'pool-1',
      name: 'us-east',
      enabled: true,
      originCount: 4,
      originEnabled: 4,
    },
  ]);

  const snapshot = await fetchLoadBalancingSnapshot();
  expect(snapshot.balancers[0].pools).toEqual([
    {
      id: 'pool-1',
      name: 'us-east',
      enabled: true,
      originCount: 4,
      originEnabled: 4,
    },
  ]);
});

test('falls back to zone load balancers when the account endpoint is forbidden', async () => {
  jest.mocked(listLoadBalancers).mockRejectedValue(
    new CloudflareApiError('forbidden'),
  );
  jest.mocked(listLoadBalancerPools).mockRejectedValue(
    new CloudflareApiError('forbidden'),
  );
  jest.mocked(fetchZonesSnapshot).mockResolvedValue({
    connectionCount: 1,
    zones: [
      {
        id: 'zone-1',
        name: 'acme.com',
        status: 'active',
        paused: false,
        plan: 'Free',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        nameServers: [],
        connectionId: 'tok-1',
      },
    ],
    accounts: [{ id: 'acc-1', name: 'Acme Corp', zoneCount: 1 }],
    issues: [],
  });
  jest.mocked(listZoneLoadBalancers).mockResolvedValue([
    {
      id: 'lb-zone',
      name: 'www.acme.com',
      enabled: true,
      steering: 'geo',
      poolIds: [],
    },
  ]);

  const snapshot = await fetchLoadBalancingSnapshot();
  expect(snapshot.issues).toEqual([]);
  expect(snapshot.balancers[0].name).toBe('www.acme.com');
});

test('aggregates audit logs and subscriptions', async () => {
  jest.mocked(listAuditLogs).mockResolvedValue([
    {
      id: 'a-1',
      action: 'update',
      actionKind: 'update',
      result: 'success',
      resource: 'zone',
      resourceId: '',
      zone: 'acme.com',
      actor: 'sarah@acme.com',
      actorKind: 'user',
      ip: '1.1.1.1',
      when: '2026-08-14T16:00:00Z',
    },
  ]);
  jest.mocked(listSubscriptions).mockResolvedValue([
    {
      id: 'sub-1',
      name: 'Workers Paid',
      planId: 'workers_paid',
      scope: 'user',
      frequency: 'monthly',
      state: 'Paid',
      price: 5,
      currency: 'USD',
      extras: '',
      started: '2026-08-01',
      ended: '2026-08-31',
    },
  ]);

  const audit = await fetchAuditSnapshot();
  const billing = await fetchBillingSnapshot();
  expect(audit.entries[0].actor).toBe('sarah@acme.com');
  expect(billing.subscriptions[0].price).toBe(5);
});

test('groups identical rate plans', () => {
  const grouped = groupSubscriptions([
    {
      id: 'a',
      name: 'Cloudflare Free Plan',
      planId: 'free',
      scope: 'zone',
      frequency: 'monthly',
      state: 'Paid',
      price: 0,
      currency: 'USD',
      extras: '',
      started: null,
      ended: null,
      accountId: 'acc-1',
      accountName: 'Acme',
      connectionId: 'tok-1',
    },
    {
      id: 'b',
      name: 'Cloudflare Free Plan',
      planId: 'free',
      scope: 'zone',
      frequency: 'monthly',
      state: 'Paid',
      price: 0,
      currency: 'USD',
      extras: '',
      started: null,
      ended: null,
      accountId: 'acc-1',
      accountName: 'Acme',
      connectionId: 'tok-1',
    },
  ]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].count).toBe(2);
});
