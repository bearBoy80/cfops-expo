import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import KvNamespaceDetail from '@/app/(tabs)/(storage)/kv/[namespace]';
import { fetchStorageMetrics } from '../cloudflare/analytics';
import { getKvEntries, listKvKeys, putKvValue } from '../cloudflare/api';
import { ActionMenuHost } from '../components/ui';
import { ThemeProvider } from '../theme/ThemeContext';

/**
 * Drives the value editor through the real action menu rather than a mocked
 * one. Both are `Modal`s, and opening the editor while the menu was still up
 * left the screen frozen, which a mocked menu cannot reproduce.
 */

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
    namespace: 'ns-1',
    accountId: 'acc-1',
    connectionId: 'tok-1',
    accountName: 'Acme Corp',
    title: 'cities',
  }),
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
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchStorageMetrics).mockResolvedValue({
    r2: new Map(),
    kv: new Map(),
    d1: new Map(),
   permissionDenied: false,
  });
  jest.mocked(listKvKeys).mockResolvedValue([{ name: '1212', expiration: null }]);
  jest.mocked(getKvEntries).mockResolvedValue(
    new Map([['1212', { value: '2222', metadata: null, expiration: null }]]),
  );
  jest.mocked(putKvValue).mockResolvedValue(undefined);
});

test('choosing Edit Value from the row menu opens the editor', async () => {
  render(
    <ThemeProvider>
      <KvNamespaceDetail />
      <ActionMenuHost />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('kv-key-0')).toBeTruthy());

  fireEvent.press(screen.getByTestId('kv-key-0'));
  // The menu names the key, so the editor is one tap away from here.
  await waitFor(() =>
    expect(screen.getByTestId('action-menu-Edit Value')).toBeTruthy(),
  );

  fireEvent.press(screen.getByTestId('action-menu-Edit Value'));

  await waitFor(() =>
    expect(screen.getByTestId('kv-value-input').props.value).toBe('2222'),
  );
  // The menu has to be gone by now, or neither modal would be on screen.
  expect(screen.queryByTestId('action-menu-backdrop')).toBeNull();

  fireEvent.changeText(screen.getByTestId('kv-value-input'), '3333');
  await act(async () => {
    fireEvent.press(screen.getByTestId('kv-value-save'));
  });

  expect(putKvValue).toHaveBeenCalledWith('bearer-1', 'acc-1', 'ns-1', {
    key: '1212',
    value: '3333',
    metadata: null,
    expiration: null,
  });
  await waitFor(() =>
    expect(screen.queryByTestId('kv-value-input')).toBeNull(),
  );
});
