import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import HomeFirewall from '@/app/(tabs)/(home)/firewall';
import HomeAnalytics from '@/app/(tabs)/(home)/analytics';
import HomePerformance from '@/app/(tabs)/(home)/performance';
import HomeUnderAttack from '@/app/(tabs)/(home)/under-attack';
import HomeAlerts from '@/app/(tabs)/(home)/alerts';
import HomeLoadBalancing from '@/app/(tabs)/(home)/lb';
import HomeAudit from '@/app/(tabs)/(home)/audit';
import HomeBilling from '@/app/(tabs)/(home)/billing';
import { fetchAnalyticsSnapshot } from '../cloudflare/analytics';
import {
  CloudflareApiError,
  getZoneSecurityLevel,
  setZoneSecurityLevel,
} from '../cloudflare/api';
import {
  fetchAlertsSnapshot,
  fetchAuditSnapshot,
  fetchBillingSnapshot,
  fetchLoadBalancingSnapshot,
} from '../cloudflare/management';
import { fetchZonesSnapshot } from '../cloudflare/resources';
import { ThemeProvider } from '../theme/ThemeContext';

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../cloudflare/resources', () => ({
  fetchZonesSnapshot: jest.fn(),
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
}));

jest.mock('../cloudflare/api', () => {
  const actual =
    jest.requireActual<typeof import('../cloudflare/api')>('../cloudflare/api');
  return {
    ...actual,
    getZoneSecurityLevel: jest.fn(),
    setZoneSecurityLevel: jest.fn(),
  };
});

jest.mock('../components/ui/actionMenu', () => ({
  ActionMenuHost: () => null,
  showActionMenu: jest.fn(),
}));

jest.mock('../cloudflare/analytics', () => {
  const actual = jest.requireActual<
    typeof import('../cloudflare/analytics')
  >('../cloudflare/analytics');
  return { ...actual, fetchAnalyticsSnapshot: jest.fn() };
});

jest.mock('../cloudflare/management', () => {
  const actual = jest.requireActual<
    typeof import('../cloudflare/management')
  >('../cloudflare/management');
  return {
    ...actual,
    fetchAlertsSnapshot: jest.fn(),
    fetchLoadBalancingSnapshot: jest.fn(),
    fetchAuditSnapshot: jest.fn(),
    fetchBillingSnapshot: jest.fn(),
  };
});

const wrap = (children: React.ReactElement) =>
  render(<ThemeProvider>{children}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
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
  jest.mocked(fetchAnalyticsSnapshot).mockResolvedValue({
    available: true,
    zones: [
      {
        zoneId: 'zone-1',
        accountId: 'acc-1',
        requests: 1_240_000,
        threats: 1800,
        bytes: 1_000_000,
        cachedBytes: 820_000,
        uniques: 88_000,
        visits: 42_000,
        pageViews: 48_000,
        series: [
          { datetime: '2026-08-13T00:00:00Z', requests: 100 },
          { datetime: '2026-08-13T01:00:00Z', requests: 200 },
        ],
      },
    ],
    events: [
      {
        zoneId: 'zone-1',
        accountId: 'acc-1',
        action: 'block',
        ruleId: 'CF-DDOS-L7',
        clientIP: '1.2.3.4',
        country: 'US',
        datetime: '2026-08-13T16:42:00Z',
      },
    ],
  });
});

test('home firewall shows blocked totals and live events', async () => {
  wrap(<HomeFirewall />);
  await waitFor(() => expect(screen.getByText('CF-DDOS-L7')).toBeTruthy());
  expect(screen.getByText('1.8K')).toBeTruthy();
  expect(screen.getByText('Live Events')).toBeTruthy();
});

test('home analytics shows request volume and breakdown', async () => {
  wrap(<HomeAnalytics />);
  await waitFor(() => expect(screen.getByText('1.2M')).toBeTruthy());
  expect(screen.getByText('42.0K')).toBeTruthy();
  expect(screen.getByText('82%')).toBeTruthy();
  expect(screen.getByText('1.8K')).toBeTruthy();
});

test('home performance lists per-zone cache and bandwidth', async () => {
  wrap(<HomePerformance />);
  await waitFor(() =>
    expect(screen.getByTestId('home-performance-zone-1')).toBeTruthy(),
  );
  expect(screen.getByText('Traffic & Performance')).toBeTruthy();
  expect(screen.getByText('acme.com')).toBeTruthy();
  expect(screen.getByText('42.0K visits (24h)')).toBeTruthy();
  expect(screen.queryByText('88.0K unique visitors today')).toBeNull();
  expect(screen.getAllByText('48.0K').length).toBeGreaterThan(0);
  expect(screen.getAllByText('1.2M').length).toBeGreaterThan(0);
  expect(screen.getAllByText('82%').length).toBeGreaterThan(0);
  expect(screen.getAllByText('977 KB').length).toBeGreaterThan(0);

  fireEvent.press(screen.getByTestId('home-performance-zone-1'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(zones)/[zoneId]/analytics',
    params: {
      zoneId: 'zone-1',
      connectionId: 'tok-1',
      name: 'acme.com',
    },
  });
});

test('home alerts lists notification history', async () => {
  jest.mocked(fetchAlertsSnapshot).mockResolvedValue({
    alerts: [
      {
        id: 'n-1',
        title: 'SSL Notification',
        detail: 'legacy.acme.net expired',
        type: 'universal_ssl_event_type',
        sent: '2026-08-14T01:00:00Z',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
    ],
    issues: [],
  });

  wrap(<HomeAlerts />);
  await waitFor(() => expect(screen.getByText('SSL Notification')).toBeTruthy());
  expect(screen.getByText(/legacy.acme.net expired/)).toBeTruthy();
});

test('home load balancing lists pools', async () => {
  jest.mocked(fetchLoadBalancingSnapshot).mockResolvedValue({
    balancers: [
      {
        id: 'lb-1',
        name: 'api.acme.com',
        enabled: true,
        steering: 'dynamic_latency',
        poolIds: ['pool-1'],
        pools: [
          {
            id: 'pool-1',
            name: 'us-east-pool',
            enabled: true,
            originCount: 4,
            originEnabled: 4,
          },
        ],
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
    ],
    issues: [],
  });

  wrap(<HomeLoadBalancing />);
  await waitFor(() => expect(screen.getByText('us-east-pool')).toBeTruthy());
  expect(screen.getByText('api.acme.com')).toBeTruthy();
});

test('home audit lists recent activity', async () => {
  jest.mocked(fetchAuditSnapshot).mockResolvedValue({
    entries: [
      {
        id: 'a-1',
        action: 'dns_record.create',
        actionKind: 'create',
        result: 'success',
        resource: 'dns_record',
        resourceId: 'rec-1',
        zone: 'acme.com',
        actor: 'sarah@acme.com',
        actorKind: 'user',
        ip: '203.0.113.9',
        when: '2026-08-14T16:38:00Z',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
    ],
    issues: [],
  });

  wrap(<HomeAudit />);
  await waitFor(() => expect(screen.getByText('sarah@acme.com')).toBeTruthy());
  expect(screen.getByText('Created DNS record')).toBeTruthy();
  expect(screen.getByText('acme.com · rec-1')).toBeTruthy();
  expect(screen.getByText('All 1')).toBeTruthy();
  expect(screen.getByText('Changes 1')).toBeTruthy();
  expect(screen.getByText('Other 0')).toBeTruthy();
});

test('home audit Changes hides token bookkeeping', async () => {
  jest.mocked(fetchAuditSnapshot).mockResolvedValue({
    entries: [
      {
        id: 'a-1',
        action: 'dns_record.create',
        actionKind: 'create',
        result: 'success',
        resource: 'dns_record',
        resourceId: 'rec-1',
        zone: 'acme.com',
        actor: 'sarah@acme.com',
        actorKind: 'user',
        ip: '203.0.113.9',
        when: '2026-08-14T16:38:00Z',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
      {
        id: 'a-2',
        action: 'Update Token',
        actionKind: 'update',
        result: 'success',
        resource: 'token',
        resourceId: 'tok-abc',
        zone: '',
        actor: 'mttao80@gmail.com',
        actorKind: 'user',
        ip: '5.34.216.107',
        when: '2026-08-14T16:40:00Z',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
    ],
    issues: [],
  });

  wrap(<HomeAudit />);
  await waitFor(() => expect(screen.getByText('Update Token')).toBeTruthy());
  fireEvent.press(screen.getByTestId('audit-filter-changes'));
  await waitFor(() => expect(screen.queryByText('Update Token')).toBeNull());
  expect(screen.getByText('Created DNS record')).toBeTruthy();
  fireEvent.press(screen.getByTestId('audit-filter-other'));
  await waitFor(() => expect(screen.getByText('Update Token')).toBeTruthy());
  expect(screen.queryByText('Created DNS record')).toBeNull();
});

test('home alerts explains the Notifications permission', async () => {
  jest.mocked(fetchAlertsSnapshot).mockResolvedValue({
    alerts: [],
    issues: [
      {
        connectionId: 'tok-1',
        label: 'jack',
        cause: new CloudflareApiError('forbidden'),
      },
    ],
  });

  wrap(<HomeAlerts />);
  await waitFor(() =>
    expect(screen.getByText(/Account · Notifications · Read/)).toBeTruthy(),
  );
  expect(screen.queryByText('Authentication error')).toBeNull();
});

test('home audit explains Account Settings Read', async () => {
  jest.mocked(fetchAuditSnapshot).mockResolvedValue({
    entries: [],
    issues: [
      {
        connectionId: 'tok-1',
        label: 'jack',
        cause: new CloudflareApiError('forbidden'),
      },
    ],
  });

  wrap(<HomeAudit />);
  await waitFor(() =>
    expect(screen.getByText(/Account · Account Settings · Read/)).toBeTruthy(),
  );
  expect(screen.queryByText('Authentication error')).toBeNull();
});

test('home billing shows subscription totals', async () => {
  jest.mocked(fetchBillingSnapshot).mockResolvedValue({
    subscriptions: [
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
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
      {
        id: 'sub-2',
        name: 'Cloudflare Free Plan',
        planId: 'free',
        scope: 'zone',
        frequency: 'monthly',
        state: 'Paid',
        price: 0,
        currency: 'USD',
        extras: '',
        started: '2026-08-01',
        ended: '2026-08-31',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
      {
        id: 'sub-3',
        name: 'Cloudflare Free Plan',
        planId: 'free',
        scope: 'zone',
        frequency: 'monthly',
        state: 'Paid',
        price: 0,
        currency: 'USD',
        extras: '',
        started: '2026-08-01',
        ended: '2026-08-31',
        accountId: 'acc-1',
        accountName: 'Acme Corp',
        connectionId: 'tok-1',
      },
    ],
    issues: [],
  });

  wrap(<HomeBilling />);
  await waitFor(() => expect(screen.getByText('Workers Paid')).toBeTruthy());
  expect(screen.getByText('Cloudflare Free Plan')).toBeTruthy();
  expect(screen.getByText(/2 subscriptions/)).toBeTruthy();
  expect(screen.getByText('Free')).toBeTruthy();
  expect(screen.getByText('Estimated total')).toBeTruthy();
  expect(screen.queryByText('Acme Corp')).toBeNull();
});

const { showActionMenu } = jest.requireMock<{
  showActionMenu: jest.Mock;
}>('../components/ui/actionMenu');

test('home under attack lists domains and enables the mode after confirm', async () => {
  jest.mocked(getZoneSecurityLevel).mockResolvedValue('medium');
  jest.mocked(setZoneSecurityLevel).mockResolvedValue(undefined);

  wrap(<HomeUnderAttack />);
  await waitFor(() =>
    expect(screen.getByTestId('under-attack-toggle-zone-1')).toBeTruthy(),
  );
  expect(screen.getByText('acme.com')).toBeTruthy();
  expect(screen.getByText('Security level · Medium')).toBeTruthy();

  fireEvent(
    screen.getByTestId('under-attack-toggle-zone-1'),
    'valueChange',
    true,
  );
  const options = showActionMenu.mock.calls[
    showActionMenu.mock.calls.length - 1
  ][0] as { actions: { onPress: () => void }[] };
  await act(async () => {
    options.actions[0].onPress();
  });

  await waitFor(() =>
    expect(setZoneSecurityLevel).toHaveBeenCalledWith(
      'bearer-1',
      'zone-1',
      'under_attack',
    ),
  );
});

test('home under attack restores the previous security level', async () => {
  jest.mocked(getZoneSecurityLevel).mockResolvedValue('under_attack');
  jest.mocked(setZoneSecurityLevel).mockResolvedValue(undefined);

  wrap(<HomeUnderAttack />);
  await waitFor(() =>
    expect(screen.getByTestId('under-attack-toggle-zone-1')).toBeTruthy(),
  );

  fireEvent(
    screen.getByTestId('under-attack-toggle-zone-1'),
    'valueChange',
    false,
  );

  await waitFor(() =>
    expect(setZoneSecurityLevel).toHaveBeenCalledWith(
      'bearer-1',
      'zone-1',
      'medium',
    ),
  );
});
