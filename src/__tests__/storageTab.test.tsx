import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Storage from '@/app/(tabs)/(storage)/index';
import {
  fetchStorageSnapshot,
  type StorageSnapshot,
} from '../cloudflare/accountResources';
import { fetchStorageMetrics } from '../cloudflare/analytics';
import { createR2Bucket } from '../cloudflare/api';
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

jest.mock('../cloudflare/accountResources', () => {
  const actual = jest.requireActual<
    typeof import('../cloudflare/accountResources')
  >('../cloudflare/accountResources');
  return {
    ...actual,
    fetchStorageSnapshot: jest.fn(),
    invalidateStorageSnapshot: jest.fn(),
  };
});

jest.mock('../cloudflare/analytics', () => ({
  fetchStorageMetrics: jest.fn(),
}));

jest.mock('../cloudflare/resources', () => ({
  getBearerForConnection: jest.fn().mockResolvedValue('bearer-1'),
}));

jest.mock('../cloudflare/api', () => {
  const actual =
    jest.requireActual<typeof import('../cloudflare/api')>('../cloudflare/api');
  return {
    ...actual,
    createR2Bucket: jest.fn(),
    createKvNamespace: jest.fn(),
    createD1Database: jest.fn(),
    deleteKvNamespace: jest.fn(),
    deleteD1Database: jest.fn(),
  };
});

const scope = {
  accountId: 'acc-1',
  accountName: 'Acme Corp',
  connectionId: 'tok-1',
};

const snapshot: StorageSnapshot = {
  connectionCount: 1,
  accounts: [scope],
  buckets: [
    { name: 'assets', location: 'wnam', creationDate: null, ...scope },
  ],
  kvNamespaces: [{ id: 'ns-1', title: 'SESSIONS', ...scope }],
  d1Databases: [
    {
      uuid: 'db-1',
      name: 'prod-db',
      version: 'production',
      createdAt: null,
      fileSize: 4096,
      numTables: 3,
      ...scope,
    },
  ],
  issues: [],
};

const wrap = () =>
  render(
    <ThemeProvider>
      <Storage />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchStorageSnapshot).mockResolvedValue(snapshot);
  jest.mocked(fetchStorageMetrics).mockResolvedValue({
    r2: new Map([
      [
        'assets',
        { objectCount: 12, payloadSize: 2048, classAOps: 10, classBOps: 90 },
      ],
    ]),
    kv: new Map([
      ['ns-1', { keyCount: 42, byteCount: 512, reads: 30, writes: 5 }],
    ]),
    d1: new Map([['db-1', { readQueries: 100, writeQueries: 20 }]]),
  });
});

test('shows the connect empty state without connections', async () => {
  jest.mocked(fetchStorageSnapshot).mockResolvedValue({
    connectionCount: 0,
    accounts: [],
    buckets: [],
    kvNamespaces: [],
    d1Databases: [],
    issues: [],
  });
  wrap();

  await waitFor(() => expect(screen.getByText('No storage')).toBeTruthy());

  fireEvent.press(screen.getByText('Connect Account'));
  expect(mockPush).toHaveBeenCalledWith('/connect');
});

test('lists R2 buckets with metrics and opens the bucket detail', async () => {
  wrap();

  await waitFor(() => expect(screen.getByText('assets')).toBeTruthy());
  expect(screen.getByText('Total Stored')).toBeTruthy();
  expect(screen.getByText('2.0 KB')).toBeTruthy();
  expect(screen.getByText('WNAM · 12 objects · 2.0 KB')).toBeTruthy();

  fireEvent.press(screen.getByTestId('storage-bucket-assets'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(storage)/r2/[bucket]',
    params: {
      bucket: 'assets',
      accountId: 'acc-1',
      connectionId: 'tok-1',
      location: 'wnam',
    },
  });
});

test('switches to KV and opens the namespace detail', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('assets')).toBeTruthy());

  fireEvent.press(screen.getByTestId('storage-segment-kv'));
  expect(screen.getByText('SESSIONS')).toBeTruthy();
  expect(screen.getByText('42 keys · 512 B')).toBeTruthy();

  fireEvent.press(screen.getByTestId('storage-kv-ns-1'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(storage)/kv/[namespace]',
    params: {
      namespace: 'ns-1',
      accountId: 'acc-1',
      connectionId: 'tok-1',
      accountName: 'Acme Corp',
      title: 'SESSIONS',
    },
  });
});

test('shows D1 databases with size and table counts', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('assets')).toBeTruthy());

  fireEvent.press(screen.getByTestId('storage-segment-d1'));
  expect(screen.getByText('prod-db')).toBeTruthy();
  expect(screen.getByText('4.0 KB · 3 tables')).toBeTruthy();

  fireEvent.press(screen.getByTestId('storage-d1-db-1'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(storage)/d1/[database]',
    params: {
      database: 'db-1',
      accountId: 'acc-1',
      connectionId: 'tok-1',
      accountName: 'Acme Corp',
      name: 'prod-db',
      version: 'production',
    },
  });
});

test('filters the current segment with the search field', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('assets')).toBeTruthy());

  fireEvent.changeText(screen.getByTestId('storage-search'), 'zzz');
  expect(screen.queryByText('assets')).toBeNull();
  expect(screen.getByText('No matches for “zzz”.')).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('storage-search'), 'sess');
  fireEvent.press(screen.getByTestId('storage-segment-kv'));
  expect(screen.getByText('SESSIONS')).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('storage-search'), 'prod');
  fireEvent.press(screen.getByTestId('storage-segment-d1'));
  expect(screen.getByText('prod-db')).toBeTruthy();
});

test('validates the bucket name before creating', async () => {
  wrap();
  await waitFor(() => expect(screen.getByTestId('storage-add')).toBeTruthy());

  fireEvent.press(screen.getByTestId('storage-add'));
  fireEvent.changeText(screen.getByTestId('storage-input-name'), 'AB');
  fireEvent.press(screen.getByTestId('storage-create'));

  expect(
    screen.getByText(
      'Bucket names are 3-63 characters: lowercase letters, digits and hyphens.',
    ),
  ).toBeTruthy();
  expect(createR2Bucket).not.toHaveBeenCalled();

  jest.mocked(createR2Bucket).mockResolvedValue(undefined);
  fireEvent.changeText(screen.getByTestId('storage-input-name'), 'my-assets');
  expect(screen.queryByTestId('storage-error-name')).toBeNull();
  fireEvent.press(screen.getByTestId('storage-location-wnam'));
  fireEvent.press(screen.getByTestId('storage-create'));

  await waitFor(() =>
    expect(createR2Bucket).toHaveBeenCalledWith(
      'bearer-1',
      'acc-1',
      'my-assets',
      'wnam',
    ),
  );
});
