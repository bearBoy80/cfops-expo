import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import R2BucketDetail from '@/app/(tabs)/(storage)/r2/[bucket]';
import { fetchStorageMetrics } from '../cloudflare/analytics';
import {
  addR2CustomDomain,
  deleteR2Bucket,
  getR2ManagedDomain,
  listR2CustomDomains,
  listR2Objects,
  setR2ManagedDomain,
} from '../cloudflare/api';
import { ThemeProvider } from '../theme/ThemeContext';

const mockBack = jest.fn();

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({
    bucket: 'assets',
    accountId: 'acc-1',
    connectionId: 'tok-1',
    location: 'wnam',
  }),
}));

jest.mock('../cloudflare/resources', () => ({
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
  fetchZonesSnapshot: jest.fn().mockResolvedValue({
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
    accounts: [],
    issues: [],
  }),
}));

jest.mock('../cloudflare/accountResources', () => ({
  invalidateStorageSnapshot: jest.fn(),
}));

jest.mock('../cloudflare/analytics', () => ({
  fetchStorageMetrics: jest.fn(),
}));

jest.mock('../components/ui/actionMenu', () => ({
  ActionMenuHost: () => null,
  showActionMenu: jest.fn(),
}));

jest.mock('../cloudflare/api', () => {
  const actual =
    jest.requireActual<typeof import('../cloudflare/api')>('../cloudflare/api');
  return {
    ...actual,
    listR2Objects: jest.fn(),
    deleteR2Bucket: jest.fn(),
    getR2ManagedDomain: jest.fn(),
    setR2ManagedDomain: jest.fn(),
    listR2CustomDomains: jest.fn(),
    addR2CustomDomain: jest.fn(),
    deleteR2CustomDomain: jest.fn(),
  };
});

const { showActionMenu } = jest.requireMock<{
  showActionMenu: jest.Mock;
}>('../components/ui/actionMenu');

const wrap = () =>
  render(
    <ThemeProvider>
      <R2BucketDetail />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listR2Objects).mockResolvedValue([
    {
      key: 'images/hero-banner.webp',
      size: 245_000,
      lastModified: '2026-08-12T00:00:00Z',
    },
  ]);
  jest.mocked(getR2ManagedDomain).mockResolvedValue({
    domain: 'pub-abc.r2.dev',
    enabled: true,
  });
  jest.mocked(listR2CustomDomains).mockResolvedValue([
    {
      domain: 'cdn.acme.com',
      enabled: true,
      status: 'active',
      zoneId: 'zone-1',
      zoneName: 'acme.com',
    },
  ]);
  jest.mocked(fetchStorageMetrics).mockResolvedValue({
    r2: new Map([
      [
        'assets',
        {
          objectCount: 12_400,
          payloadSize: 3_200_000_000,
          classAOps: 45_000,
          classBOps: 2_100_000,
        },
      ],
    ]),
    kv: new Map(),
    d1: new Map(),
  });
});

test('renders bucket metrics, egress and the object list', async () => {
  wrap();

  await waitFor(() =>
    expect(screen.getByText('images/hero-banner.webp')).toBeTruthy(),
  );
  expect(screen.getByText('assets')).toBeTruthy();
  expect(screen.getByText('WNAM · R2')).toBeTruthy();
  expect(screen.getByText('12.4K')).toBeTruthy();
  expect(screen.getByText('3.0 GB')).toBeTruthy();
  expect(screen.getByText('45.0K')).toBeTruthy();
  expect(screen.getByText('2.1M')).toBeTruthy();
  expect(screen.getByText('$0.00 · always free')).toBeTruthy();
  expect(screen.getByText('cdn.acme.com')).toBeTruthy();
});

test('disables the r2.dev public URL', async () => {
  jest.mocked(setR2ManagedDomain).mockResolvedValue(undefined);
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-toggle-public')).toBeTruthy(),
  );

  fireEvent(screen.getByTestId('r2-toggle-public'), 'valueChange', false);

  await waitFor(() =>
    expect(setR2ManagedDomain).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'assets',
      false,
    ),
  );
});

test('adds a custom domain after validation', async () => {
  jest.mocked(addR2CustomDomain).mockResolvedValue(undefined);
  wrap();
  await waitFor(() => expect(screen.getByTestId('r2-add-domain')).toBeTruthy());

  fireEvent.press(screen.getByTestId('r2-add-domain'));
  fireEvent.changeText(screen.getByTestId('r2-domain-input'), 'not a host');
  fireEvent.press(screen.getByTestId('r2-domain-save'));
  expect(screen.getByTestId('r2-domain-error')).toBeTruthy();
  expect(addR2CustomDomain).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByTestId('r2-domain-input'), 'img.acme.com');
  fireEvent.press(screen.getByTestId('r2-domain-save'));

  await waitFor(() =>
    expect(addR2CustomDomain).toHaveBeenCalledWith('bearer-1', 'acc-1', 'assets', {
      domain: 'img.acme.com',
      zoneId: 'zone-1',
    }),
  );
});

test('deletes the bucket after confirmation and navigates back', async () => {
  jest.mocked(deleteR2Bucket).mockResolvedValue(undefined);
  wrap();
  await waitFor(() =>
    expect(screen.getByTestId('r2-delete-bucket')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('r2-delete-bucket'));
  const options = showActionMenu.mock.calls[
    showActionMenu.mock.calls.length - 1
  ][0] as { actions: { onPress: () => void }[] };
  options.actions[0].onPress();

  await waitFor(() =>
    expect(deleteR2Bucket).toHaveBeenCalledWith('bearer-1', 'acc-1', 'assets'),
  );
  expect(mockBack).toHaveBeenCalled();
});
