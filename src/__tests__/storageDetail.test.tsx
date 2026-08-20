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
  deleteKvKeys,
  deleteKvNamespace,
  getD1Database,
  getKvEntries,
  listD1Tables,
  listKvKeys,
  putKvValue,
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
  invalidateStorageMetrics: jest.fn(),
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
    getKvEntries: jest.fn(),
    putKvValue: jest.fn(),
    deleteKvKeys: jest.fn(),
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
  jest.mocked(getKvEntries).mockResolvedValue(
    new Map([
      [
        'session:abc',
        { value: '{"user":1}', metadata: { tag: 'a' }, expiration: 1893456000 },
      ],
    ]),
  );
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

const kvParams = {
  namespace: 'ns-1',
  accountId: 'acc-1',
  connectionId: 'tok-1',
  accountName: 'Acme Corp',
  title: 'SESSIONS',
};

const lastMenu = () =>
  showActionMenu.mock.calls[showActionMenu.mock.calls.length - 1][0] as {
    actions: { onPress: () => void }[];
  };

test('kv rows preview the stored value', async () => {
  mockParams.mockReturnValue(kvParams);

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByText('session:abc')).toBeTruthy());

  expect(getKvEntries).toHaveBeenCalledWith('bearer-1', 'acc-1', 'ns-1', [
    'session:abc',
  ]);
  expect(screen.getByTestId('kv-value-0')).toHaveTextContent('{"user":1}');
});

test('kv key list survives a token that cannot read values', async () => {
  mockParams.mockReturnValue(kvParams);
  jest.mocked(getKvEntries).mockRejectedValue(new Error('forbidden'));

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByText('session:abc')).toBeTruthy());
  expect(screen.queryByTestId('kv-value-0')).toBeNull();
});

test('editing a key writes the value back with its metadata and expiry', async () => {
  mockParams.mockReturnValue(kvParams);
  jest.mocked(putKvValue).mockResolvedValue(undefined);

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-key-0')).toBeTruthy());

  fireEvent.press(screen.getByTestId('kv-key-0'));
  lastMenu().actions[0].onPress();

  // The editor re-reads the value, so the input only appears once it lands.
  await waitFor(() =>
    expect(screen.getByTestId('kv-value-input').props.value).toBe(
      '{"user":1}',
    ),
  );
  fireEvent.changeText(screen.getByTestId('kv-value-input'), '{"user":2}');
  fireEvent.press(screen.getByTestId('kv-value-save'));

  await waitFor(() =>
    expect(putKvValue).toHaveBeenCalledWith('bearer-1', 'acc-1', 'ns-1', {
      key: 'session:abc',
      value: '{"user":2}',
      metadata: { tag: 'a' },
      expiration: 1893456000,
    }),
  );
  expect(screen.getByTestId('kv-value-0')).toHaveTextContent('{"user":2}');
});

test('a new key is created from the add row', async () => {
  mockParams.mockReturnValue(kvParams);
  jest.mocked(putKvValue).mockResolvedValue(undefined);

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-add-key')).toBeTruthy());

  fireEvent.press(screen.getByTestId('kv-add-key'));
  fireEvent.changeText(screen.getByTestId('kv-key-input'), 'session:def');
  fireEvent.changeText(screen.getByTestId('kv-value-input'), 'hello');
  fireEvent.press(screen.getByTestId('kv-value-save'));

  await waitFor(() =>
    expect(putKvValue).toHaveBeenCalledWith('bearer-1', 'acc-1', 'ns-1', {
      key: 'session:def',
      value: 'hello',
      metadata: undefined,
      expiration: undefined,
    }),
  );
  // The list itself changed, so it has to be re-read rather than guessed at.
  expect(jest.mocked(listKvKeys).mock.calls.length).toBeGreaterThan(1);
});

test('creating a key rejects a name that is empty, spaced or already taken', async () => {
  mockParams.mockReturnValue(kvParams);

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-add-key')).toBeTruthy());
  fireEvent.press(screen.getByTestId('kv-add-key'));

  fireEvent.press(screen.getByTestId('kv-value-save'));
  expect(screen.getByTestId('kv-key-error')).toHaveTextContent(
    'Key names cannot be empty or contain spaces.',
  );

  fireEvent.changeText(screen.getByTestId('kv-key-input'), 'has space');
  fireEvent.press(screen.getByTestId('kv-value-save'));
  expect(screen.getByTestId('kv-key-error')).toHaveTextContent(
    'Key names cannot be empty or contain spaces.',
  );

  // An upsert would silently replace the existing value, so the name is barred.
  fireEvent.changeText(screen.getByTestId('kv-key-input'), 'session:abc');
  fireEvent.press(screen.getByTestId('kv-value-save'));
  expect(screen.getByTestId('kv-key-error')).toHaveTextContent(
    'This namespace already has a key with that name.',
  );

  expect(putKvValue).not.toHaveBeenCalled();
});

test('an empty namespace still offers the add row', async () => {
  mockParams.mockReturnValue(kvParams);
  jest.mocked(listKvKeys).mockResolvedValue([]);
  jest.mocked(getKvEntries).mockResolvedValue(new Map());

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-add-key')).toBeTruthy());
  // Both: the message explains the emptiness, the row is the way out of it.
  expect(
    screen.getByText(
      'No keys in this namespace, or listing is not permitted for this token.',
    ),
  ).toBeTruthy();
  // Nothing to select, so the header control stays away.
  expect(screen.queryByTestId('kv-toggle-select')).toBeNull();
});

test('the add row is hidden while picking keys to delete', async () => {
  mockParams.mockReturnValue(kvParams);

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-add-key')).toBeTruthy());

  fireEvent.press(screen.getByTestId('kv-toggle-select'));
  expect(screen.queryByTestId('kv-add-key')).toBeNull();

  fireEvent.press(screen.getByTestId('kv-exit-select'));
  expect(screen.getByTestId('kv-add-key')).toBeTruthy();
});

test('a selected key is deleted from the toolbar', async () => {
  mockParams.mockReturnValue(kvParams);
  jest
    .mocked(deleteKvKeys)
    .mockResolvedValue({ deleted: ['session:abc'], failed: [] });

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-key-0')).toBeTruthy());

  fireEvent.press(screen.getByTestId('kv-toggle-select'));
  fireEvent.press(screen.getByTestId('kv-key-0'));
  fireEvent.press(screen.getByTestId('kv-delete-keys'));
  lastMenu().actions[0].onPress();

  await waitFor(() =>
    expect(deleteKvKeys).toHaveBeenCalledWith('bearer-1', 'acc-1', 'ns-1', [
      'session:abc',
    ]),
  );
  // Nothing is left to act on, so the plain list comes back on its own.
  await waitFor(() => expect(screen.queryByTestId('kv-delete-keys')).toBeNull());
  expect(screen.getByTestId('kv-toggle-select')).toBeTruthy();
  expect(screen.getByTestId('kv-add-key')).toBeTruthy();
});

test('a partly failed delete keeps selection mode open on the failures', async () => {
  mockParams.mockReturnValue(kvParams);
  jest
    .mocked(deleteKvKeys)
    .mockResolvedValue({ deleted: [], failed: ['session:abc'] });

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-key-0')).toBeTruthy());

  fireEvent.press(screen.getByTestId('kv-toggle-select'));
  fireEvent.press(screen.getByTestId('kv-key-0'));
  fireEvent.press(screen.getByTestId('kv-delete-keys'));
  lastMenu().actions[0].onPress();

  await waitFor(() => expect(deleteKvKeys).toHaveBeenCalled());
  // Still selected, so the retry does not have to be set up again.
  expect(screen.getByTestId('kv-delete-keys')).toBeTruthy();
  expect(screen.getByText('Delete 1 key')).toBeTruthy();
});

test('the row menu deletes a single key without entering selection mode', async () => {
  mockParams.mockReturnValue(kvParams);
  jest
    .mocked(deleteKvKeys)
    .mockResolvedValue({ deleted: ['session:abc'], failed: [] });

  wrap(<KvNamespaceDetail />);
  await waitFor(() => expect(screen.getByTestId('kv-key-0')).toBeTruthy());

  fireEvent.press(screen.getByTestId('kv-key-0'));
  lastMenu().actions[1].onPress();

  await waitFor(() =>
    expect(deleteKvKeys).toHaveBeenCalledWith('bearer-1', 'acc-1', 'ns-1', [
      'session:abc',
    ]),
  );
  expect(screen.queryByTestId('kv-delete-keys')).toBeNull();
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
