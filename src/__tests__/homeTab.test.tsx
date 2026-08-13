import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Home from '../../app/(tabs)/(home)/index';
import type { AnalyticsSnapshot } from '../cloudflare/analytics';
import { fetchAnalyticsSnapshot } from '../cloudflare/analytics';
import { CloudflareApiError } from '../cloudflare/api';
import { fetchZonesSnapshot } from '../cloudflare/resources';
import type { ZonesSnapshot } from '../cloudflare/resources';
import { ThemeProvider } from '../theme/ThemeContext';

const mockPush = jest.fn();

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      useEffect(callback, [callback]);
    },
  };
});

jest.mock('../cloudflare/resources', () => ({
  fetchZonesSnapshot: jest.fn(),
}));

jest.mock('../cloudflare/analytics', () => {
  const actual = jest.requireActual<
    typeof import('../cloudflare/analytics')
  >('../cloudflare/analytics');
  return { ...actual, fetchAnalyticsSnapshot: jest.fn() };
});

const snapshot: ZonesSnapshot = {
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
    {
      id: 'zone-2',
      name: 'staging.acme.com',
      status: 'pending',
      paused: false,
      plan: 'Pro',
      accountId: 'acc-1',
      accountName: 'Acme Corp',
      nameServers: [],
      connectionId: 'tok-1',
    },
  ],
  accounts: [{ id: 'acc-1', name: 'Acme Corp', zoneCount: 2 }],
  issues: [],
};

const noAnalytics: AnalyticsSnapshot = {
  available: false,
  zones: [],
  events: [],
};

const analytics: AnalyticsSnapshot = {
  available: true,
  zones: [
    {
      zoneId: 'zone-1',
      accountId: 'acc-1',
      requests: 6_400_000_000,
      threats: 143_000,
      bytes: 22_500_000_000_000,
      cachedBytes: 18_900_000_000_000,
      series: [
        { datetime: '2026-08-13T00:00:00Z', requests: 14_200 },
        { datetime: '2026-08-13T01:00:00Z', requests: 9_800 },
        { datetime: '2026-08-13T02:00:00Z', requests: 28_600 },
      ],
    },
  ],
  events: [
    {
      zoneId: 'zone-1',
      accountId: 'acc-1',
      action: 'block',
      ruleId: 'CF-DDOS-L7',
      clientIP: '185.220.101.45',
      country: 'RU',
      datetime: '2026-08-13T16:42:00Z',
    },
  ],
};

const wrap = () =>
  render(
    <ThemeProvider>
      <Home />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchZonesSnapshot).mockResolvedValue(snapshot);
  jest.mocked(fetchAnalyticsSnapshot).mockResolvedValue(noAnalytics);
});

test('shows the empty state when nothing is connected', async () => {
  jest.mocked(fetchZonesSnapshot).mockResolvedValue({
    connectionCount: 0,
    zones: [],
    accounts: [],
    issues: [],
  });
  wrap();

  await waitFor(() =>
    expect(screen.getByText('No accounts connected')).toBeTruthy(),
  );

  fireEvent.press(screen.getByText('Connect Account'));
  expect(mockPush).toHaveBeenCalledWith('/connect');
});

test('summarizes zones and accounts', async () => {
  wrap();

  await waitFor(() =>
    expect(screen.getByText('All systems operational')).toBeTruthy(),
  );
  expect(screen.getByText('1 account · 2 zones')).toBeTruthy();
  expect(screen.getByText('Acme Corp')).toBeTruthy();
  expect(screen.getByText('All Accounts')).toBeTruthy();
  // Analytics are unavailable, so the metric tiles fall back to placeholders.
  expect(screen.getAllByText('—').length).toBeGreaterThan(0);
});

test('renders analytics metrics, chart and events when available', async () => {
  jest.mocked(fetchAnalyticsSnapshot).mockResolvedValue(analytics);
  wrap();

  // "6.4B" appears in the requests tile and on the account row's right side.
  await waitFor(() =>
    expect(screen.getAllByText('6.4B').length).toBeGreaterThanOrEqual(2),
  );
  expect(screen.getByText('143K')).toBeTruthy();
  expect(screen.getByText('17.2 TB')).toBeTruthy();
  expect(screen.getByText('84% cache hit')).toBeTruthy();
  expect(screen.getByText('Requests / 24h')).toBeTruthy();
  expect(screen.getByText('CF-DDOS-L7')).toBeTruthy();
  expect(screen.getByText('185.220.101.45 · RU · 16:42')).toBeTruthy();

  // Tapping an event opens the firewall page of the zone it belongs to.
  fireEvent.press(screen.getByTestId('home-event-0'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(zones)/[zoneId]/firewall',
    params: { zoneId: 'zone-1', connectionId: 'tok-1', name: 'acme.com' },
  });
});

test('shows an empty recent events card when analytics work but no events', async () => {
  jest
    .mocked(fetchAnalyticsSnapshot)
    .mockResolvedValue({ ...analytics, events: [] });
  wrap();

  await waitFor(() => expect(screen.getByText('Recent Events')).toBeTruthy());
  expect(
    screen.getByText('No firewall events in the last 24 hours.'),
  ).toBeTruthy();
});

test('flags connections that need attention', async () => {
  jest.mocked(fetchZonesSnapshot).mockResolvedValue({
    ...snapshot,
    issues: [
      {
        connectionId: 'tok-1',
        label: 'Ops token',
        cause: new CloudflareApiError('invalid-token'),
      },
    ],
  });
  wrap();

  await waitFor(() =>
    expect(screen.getByText('1 connection needs attention')).toBeTruthy(),
  );
  expect(
    screen.getByText('Ops token: The API token is invalid or expired.'),
  ).toBeTruthy();
});

test('scopes the overview to an account from the accounts list', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('Acme Corp')).toBeTruthy());

  fireEvent.press(screen.getByText('Acme Corp'));

  // The large title now shows the account, and the account bar keeps it too.
  await waitFor(() =>
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThanOrEqual(2),
  );
  expect(screen.getByText('Enterprise · 2 zones')).toBeTruthy();

  // Switching back to All Accounts through the sheet restores the overview.
  fireEvent.press(screen.getByTestId('home-account-bar'));
  fireEvent.press(screen.getByTestId('home-scope-all'));
  await waitFor(() => expect(screen.getByText('Overview')).toBeTruthy());
});

test('navigates to tabs from quick access', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('DNS Records')).toBeTruthy());

  fireEvent.press(screen.getByText('DNS Records'));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/(zones)');

  fireEvent.press(screen.getByText('Workers'));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/(compute)');
});
