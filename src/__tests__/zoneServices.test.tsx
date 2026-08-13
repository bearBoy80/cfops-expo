import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ZoneAnalytics from '../../app/(tabs)/(zones)/[zoneId]/analytics';
import ZoneDns from '../../app/(tabs)/(zones)/[zoneId]/dns';
import ZoneFirewall from '../../app/(tabs)/(zones)/[zoneId]/firewall';
import {
  fetchZoneFirewallEvents,
  fetchZoneHourly,
} from '../cloudflare/analytics';
import {
  createDnsRecord,
  deleteDnsRecord,
  listDnsRecords,
} from '../cloudflare/api';
import { ThemeProvider } from '../theme/ThemeContext';

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({
    zoneId: 'zone-1',
    connectionId: 'tok-1',
    name: 'acme.com',
  }),
}));

jest.mock('../cloudflare/resources', () => ({
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
}));

jest.mock('../cloudflare/analytics', () => ({
  fetchZoneHourly: jest.fn(),
  fetchZoneFirewallEvents: jest.fn(),
  fetchZoneTraffic: jest.fn(),
}));

jest.mock('../cloudflare/api', () => {
  const actual =
    jest.requireActual<typeof import('../cloudflare/api')>('../cloudflare/api');
  return {
    ...actual,
    listDnsRecords: jest.fn(),
    createDnsRecord: jest.fn(),
    updateDnsRecord: jest.fn(),
    deleteDnsRecord: jest.fn(),
    getZoneSslMode: jest.fn(),
    listCertificatePacks: jest.fn(),
    purgeZoneCache: jest.fn(),
  };
});

const wrap = (children: React.ReactElement) =>
  render(<ThemeProvider>{children}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
});

test('DNS page lists records with type badges and proxy state', async () => {
  jest.mocked(listDnsRecords).mockResolvedValue([
    {
      id: 'rec-1',
      type: 'A',
      name: 'acme.com',
      content: '104.21.45.67',
      proxied: true,
      ttl: 1,
    },
    {
      id: 'rec-2',
      type: 'TXT',
      name: 'acme.com',
      content: 'v=spf1 include:_spf.google.com ~all',
      proxied: false,
      ttl: 300,
    },
  ]);

  wrap(<ZoneDns />);

  await waitFor(() => expect(screen.getByText('104.21.45.67')).toBeTruthy());
  expect(screen.getByText('A')).toBeTruthy();
  expect(screen.getByText('TXT')).toBeTruthy();
  expect(screen.getByText('acme.com · 2 records')).toBeTruthy();
});

test('creates a DNS record from the add sheet', async () => {
  jest.mocked(listDnsRecords).mockResolvedValue([]);
  jest.mocked(createDnsRecord).mockResolvedValue(undefined);

  wrap(<ZoneDns />);
  await waitFor(() => expect(screen.getByTestId('dns-add')).toBeTruthy());

  fireEvent.press(screen.getByTestId('dns-add'));
  fireEvent.press(screen.getByTestId('dns-type-CNAME'));
  fireEvent.changeText(screen.getByTestId('dns-input-name'), 'www');
  fireEvent.changeText(screen.getByTestId('dns-input-content'), 'acme.dev');
  fireEvent(screen.getByTestId('dns-toggle-proxied'), 'valueChange', true);
  fireEvent.press(screen.getByTestId('dns-save'));

  await waitFor(() =>
    expect(createDnsRecord).toHaveBeenCalledWith('bearer-1', 'zone-1', {
      type: 'CNAME',
      name: 'www',
      content: 'acme.dev',
      ttl: 1,
      proxied: true,
      priority: undefined,
    }),
  );
});

test('blocks saving an invalid record and shows inline field errors', async () => {
  jest.mocked(listDnsRecords).mockResolvedValue([]);

  wrap(<ZoneDns />);
  await waitFor(() => expect(screen.getByTestId('dns-add')).toBeTruthy());

  // An A record whose content is not an IPv4 address must not be submitted.
  fireEvent.press(screen.getByTestId('dns-add'));
  fireEvent.changeText(screen.getByTestId('dns-input-name'), 'www');
  fireEvent.changeText(screen.getByTestId('dns-input-content'), 'not-an-ip');
  fireEvent.press(screen.getByTestId('dns-save'));

  expect(
    screen.getByText('A records need a valid IPv4 address, e.g. 203.0.113.10.'),
  ).toBeTruthy();
  expect(createDnsRecord).not.toHaveBeenCalled();

  // Correcting the content clears the error and allows submission.
  jest.mocked(createDnsRecord).mockResolvedValue(undefined);
  fireEvent.changeText(screen.getByTestId('dns-input-content'), '1.2.3.4');
  expect(screen.queryByTestId('dns-error-content')).toBeNull();
  fireEvent.press(screen.getByTestId('dns-save'));

  await waitFor(() => expect(createDnsRecord).toHaveBeenCalled());
});

test('deletes a DNS record from the editor after confirmation', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(listDnsRecords).mockResolvedValue([
    {
      id: 'rec-1',
      type: 'A',
      name: 'acme.com',
      content: '104.21.45.67',
      proxied: true,
      ttl: 1,
    },
  ]);
  jest.mocked(deleteDnsRecord).mockResolvedValue(undefined);

  wrap(<ZoneDns />);
  await waitFor(() =>
    expect(screen.getByTestId('dns-record-rec-1')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('dns-record-rec-1'));
  fireEvent.press(screen.getByTestId('dns-delete'));

  const calls = jest.mocked(Alert.alert).mock.calls;
  const confirm = calls[calls.length - 1][2]?.find(
    (button) => button.style !== 'cancel',
  );
  confirm?.onPress?.();

  await waitFor(() =>
    expect(deleteDnsRecord).toHaveBeenCalledWith('bearer-1', 'zone-1', 'rec-1'),
  );
});

test('firewall page shows metrics and live events', async () => {
  jest.mocked(fetchZoneFirewallEvents).mockResolvedValue([
    {
      action: 'block',
      ruleId: 'CF-DDOS-L7',
      clientIP: '185.220.101.45',
      country: 'RU',
      path: '/wp-admin/xmlrpc.php',
      datetime: '2026-08-13T16:42:00Z',
    },
    {
      action: 'managed_challenge',
      ruleId: 'RATE-001',
      clientIP: '45.142.212.100',
      country: 'DE',
      path: '/api/v1/auth/login',
      datetime: '2026-08-13T16:41:00Z',
    },
  ]);
  jest.mocked(fetchZoneHourly).mockResolvedValue({
    requests: 500_000,
    threats: 24_800,
    cachedRequests: 100_000,
    uniques: 88_000,
    cacheRatioPct: 20,
    series: [],
  });

  wrap(<ZoneFirewall />);

  await waitFor(() => expect(screen.getByText('CF-DDOS-L7')).toBeTruthy());
  expect(screen.getByText('24.8K')).toBeTruthy();
  expect(screen.getByText('Live Events')).toBeTruthy();
  expect(
    screen.getByText('185.220.101.45 · RU · /wp-admin/xmlrpc.php'),
  ).toBeTruthy();
});

test('analytics page shows request volume and breakdown', async () => {
  jest.mocked(fetchZoneHourly).mockResolvedValue({
    requests: 1_240_000_000,
    threats: 24_800,
    cachedRequests: 1_016_800_000,
    uniques: 8_400_000,
    cacheRatioPct: 82,
    series: [
      { label: '00', value: 100 },
      { label: '01', value: 200 },
    ],
  });

  wrap(<ZoneAnalytics />);

  await waitFor(() => expect(screen.getByText('1.2B')).toBeTruthy());
  expect(screen.getByText('Request Volume')).toBeTruthy();
  expect(screen.getByText('82%')).toBeTruthy();
  expect(screen.getByText('24.8K')).toBeTruthy();
  expect(screen.getByText('8.4M')).toBeTruthy();
});
