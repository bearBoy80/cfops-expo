import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import KvNamespaceDetail from '@/app/(tabs)/(storage)/kv/[namespace]';
import D1DatabaseDetail from '@/app/(tabs)/(storage)/d1/[database]';
import { fetchStorageMetrics } from '../cloudflare/analytics';
import {
  deleteD1Database,
  deleteKvNamespace,
  getD1Database,
  listD1Tables,
  listKvKeys,
} from '../cloudflare/api';
import { ThemeProvider } from '../theme/ThemeContext';

const mockBack = jest.fn();
const mockParams = jest.fn();

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
  useLocalSearchParams: () => mockParams(),
}));

jest.mock('../cloudflare/resources', () => ({
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
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
    listKvKeys: jest.fn(),
    deleteKvNamespace: jest.fn(),
    getD1Database: jest.fn(),
    listD1Tables: jest.fn(),
    deleteD1Database: jest.fn(),
  };
});

const { showActionMenu } = jest.requireMock<{
  showActionMenu: jest.Mock;
}>('../components/ui/actionMenu');

const wrap = (children: React.ReactElement) =>
  render(<ThemeProvider>{children}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchStorageMetrics).mockResolvedValue({
    r2: new Map(),
    kv: new Map([
      ['ns-1', { keyCount: 42, byteCount: 512, reads: 30, writes: 5 }],
    ]),
    d1: new Map([['db-1', { readQueries: 100, writeQueries: 20 }]]),
  });
  jest.mocked(listKvKeys).mockResolvedValue([
    { name: 'session:abc', expiration: null },
  ]);
  jest.mocked(getD1Database).mockResolvedValue({
    uuid: 'db-1',
    name: 'prod-db',
    version: 'production',
    createdAt: '2026-02-02T00:00:00Z',
    fileSize: 4096,
    numTables: 2,
  });
  jest.mocked(listD1Tables).mockResolvedValue(['users', 'posts']);
});

test('kv detail lists keys and deletes after confirmation', async () => {
  mockParams.mockReturnValue({
    namespace: 'ns-1',
    accountId: 'acc-1',
    connectionId: 'tok-1',
    accountName: 'Acme Corp',
    title: 'SESSIONS',
  });
  jest.mocked(deleteKvNamespace).mockResolvedValue(undefined);

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByText('session:abc')).toBeTruthy());
  expect(screen.getByText('42')).toBeTruthy();
  expect(screen.getByText('Reads')).toBeTruthy();
  expect(screen.getByText('Writes')).toBeTruthy();

  fireEvent.press(screen.getByTestId('kv-delete-namespace'));
  const options = showActionMenu.mock.calls[
    showActionMenu.mock.calls.length - 1
  ][0] as { actions: { onPress: () => void }[] };
  options.actions[0].onPress();

  await waitFor(() =>
    expect(deleteKvNamespace).toHaveBeenCalledWith('bearer-1', 'acc-1', 'ns-1'),
  );
  expect(mockBack).toHaveBeenCalled();
});

test('kv keys tile falls back to the listed key count when analytics is empty', async () => {
  mockParams.mockReturnValue({
    namespace: 'ns-1',
    accountId: 'acc-1',
    connectionId: 'tok-1',
    accountName: 'Acme Corp',
    title: 'REPORTS_KV',
  });
  jest.mocked(fetchStorageMetrics).mockResolvedValue({
    r2: new Map(),
    kv: new Map(),
    d1: new Map(),
  });

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByText('session:abc')).toBeTruthy());
  expect(screen.getByText('1')).toBeTruthy();
});

test('d1 detail lists tables and deletes after confirmation', async () => {
  mockParams.mockReturnValue({
    database: 'db-1',
    accountId: 'acc-1',
    connectionId: 'tok-1',
    accountName: 'Acme Corp',
    name: 'prod-db',
    version: 'production',
  });
  jest.mocked(deleteD1Database).mockResolvedValue(undefined);

  wrap(<D1DatabaseDetail />);
  await waitFor(() => expect(screen.getByTestId('d1-table-users')).toBeTruthy());
  expect(screen.getByText('posts')).toBeTruthy();
  expect(screen.getByText('4.0 KB')).toBeTruthy();

  fireEvent.press(screen.getByTestId('d1-delete-database'));
  const options = showActionMenu.mock.calls[
    showActionMenu.mock.calls.length - 1
  ][0] as { actions: { onPress: () => void }[] };
  options.actions[0].onPress();

  await waitFor(() =>
    expect(deleteD1Database).toHaveBeenCalledWith('bearer-1', 'acc-1', 'db-1'),
  );
  expect(mockBack).toHaveBeenCalled();
});
