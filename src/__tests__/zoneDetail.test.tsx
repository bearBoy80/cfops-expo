import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ZoneDetail from '../../app/(tabs)/(zones)/[zoneId]';
import { fetchZoneTraffic } from '../cloudflare/analytics';
import {
  countDnsRecords,
  deleteZone,
  getZone,
  getZoneSslMode,
  setZonePaused,
  type CfZone,
} from '../cloudflare/api';
import { ThemeProvider } from '../theme/ThemeContext';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({
    zoneId: 'zone-1',
    connectionId: 'tok-1',
    name: 'acme.com',
  }),
}));

jest.mock('../cloudflare/connections', () => ({
  listConnections: jest
    .fn()
    .mockResolvedValue([{ id: 'tok-1', label: 'Ops', authType: 'token' }]),
}));

jest.mock('../cloudflare/resources', () => ({
  getConnectionBearer: jest.fn().mockResolvedValue('bearer-1'),
  invalidateZonesSnapshot: jest.fn(),
}));

jest.mock('../cloudflare/analytics', () => ({
  fetchZoneTraffic: jest.fn(),
  invalidateAnalyticsSnapshot: jest.fn(),
}));

jest.mock('../cloudflare/api', () => {
  const actual =
    jest.requireActual<typeof import('../cloudflare/api')>('../cloudflare/api');
  return {
    ...actual,
    getZone: jest.fn(),
    getZoneSslMode: jest.fn(),
    countDnsRecords: jest.fn(),
    purgeZoneCache: jest.fn(),
    setZonePaused: jest.fn(),
    deleteZone: jest.fn(),
  };
});

const zone: CfZone = {
  id: 'zone-1',
  name: 'acme.com',
  status: 'active',
  paused: false,
  plan: 'Enterprise',
  accountId: 'acc-1',
  accountName: 'Acme Corp',
  nameServers: ['a.ns.cloudflare.com'],
};

const wrap = () =>
  render(
    <ThemeProvider>
      <ZoneDetail />
    </ThemeProvider>,
  );

/** Presses the confirm (non-cancel) button of the last Alert.alert call. */
const confirmLastAlert = () => {
  const calls = jest.mocked(Alert.alert).mock.calls;
  const buttons = calls[calls.length - 1][2];
  const confirm = buttons?.find((button) => button.style !== 'cancel');
  confirm?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(getZone).mockResolvedValue(zone);
  jest.mocked(getZoneSslMode).mockResolvedValue('strict');
  jest.mocked(countDnsRecords).mockResolvedValue(8);
  jest.mocked(fetchZoneTraffic).mockResolvedValue({
    requests: 1_240_000_000,
    threats: 24_800,
    cachedRequests: 1_016_800_000,
    bytes: 22_500_000_000_000,
    cachedBytes: 18_900_000_000_000,
    cacheRatioPct: 82,
  });
});

test('renders details, traffic and services with live values', async () => {
  wrap();

  await waitFor(() => expect(screen.getByText('Enterprise')).toBeTruthy());
  // SSL mode shows in Zone Details and the Services row.
  expect(screen.getAllByText('Full (strict)')).toHaveLength(2);
  expect(screen.getAllByText('82%')).toHaveLength(2);
  expect(screen.getByText('1.2B')).toBeTruthy();
  expect(screen.getByText('24.8K')).toBeTruthy();
  expect(screen.getByText('8 records')).toBeTruthy();
  expect(screen.getByText('24.8K blocked')).toBeTruthy();
  expect(screen.getByText('1.2B req')).toBeTruthy();
  expect(screen.getByText('a.ns.cloudflare.com')).toBeTruthy();
});

test('pauses the zone after confirmation', async () => {
  jest.mocked(setZonePaused).mockResolvedValue({ ...zone, paused: true });
  wrap();
  await waitFor(() => expect(screen.getByText('Pause Zone')).toBeTruthy());

  fireEvent.press(screen.getByTestId('zone-action-pause'));
  confirmLastAlert();

  await waitFor(() =>
    expect(setZonePaused).toHaveBeenCalledWith('bearer-1', 'zone-1', true),
  );
  await waitFor(() => expect(screen.getByText('Resume Zone')).toBeTruthy());
});

test('opens the DNS service page from the services list', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('8 records')).toBeTruthy());

  fireEvent.press(screen.getByTestId('zone-service-dns'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(zones)/[zoneId]/dns',
    params: { zoneId: 'zone-1', connectionId: 'tok-1', name: 'acme.com' },
  });
});

test('removes the zone and navigates back after confirmation', async () => {
  jest.mocked(deleteZone).mockResolvedValue(undefined);
  wrap();
  await waitFor(() => expect(screen.getByText('Remove Zone')).toBeTruthy());

  fireEvent.press(screen.getByTestId('zone-action-remove'));
  confirmLastAlert();

  await waitFor(() =>
    expect(deleteZone).toHaveBeenCalledWith('bearer-1', 'zone-1'),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
