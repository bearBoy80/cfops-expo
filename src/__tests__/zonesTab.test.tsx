import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Zones from '../../app/(tabs)/(zones)/index';
import { fetchZonesSnapshot } from '../cloudflare/resources';
import type { ZonesSnapshot } from '../cloudflare/resources';
import { zonePillStatus } from '../components/ui';
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
      name: 'side.dev',
      status: 'pending',
      paused: false,
      plan: 'Free',
      accountId: 'acc-2',
      accountName: 'Side Project',
      nameServers: [],
      connectionId: 'tok-1',
    },
  ],
  accounts: [
    { id: 'acc-1', name: 'Acme Corp', zoneCount: 1 },
    { id: 'acc-2', name: 'Side Project', zoneCount: 1 },
  ],
  issues: [],
};

const wrap = () =>
  render(
    <ThemeProvider>
      <Zones />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchZonesSnapshot).mockResolvedValue(snapshot);
});

describe('zonePillStatus', () => {
  test('maps zone states to pill statuses', () => {
    expect(zonePillStatus({ status: 'active', paused: false })).toBe('active');
    expect(zonePillStatus({ status: 'active', paused: true })).toBe('paused');
    expect(zonePillStatus({ status: 'pending', paused: false })).toBe(
      'pending',
    );
    expect(zonePillStatus({ status: 'initializing', paused: false })).toBe(
      'pending',
    );
    expect(zonePillStatus({ status: 'deactivated', paused: false })).toBe(
      'error',
    );
  });
});

describe('Zones list', () => {
  test('shows the connect empty state without connections', async () => {
    jest.mocked(fetchZonesSnapshot).mockResolvedValue({
      connectionCount: 0,
      zones: [],
      accounts: [],
      issues: [],
    });
    wrap();

    await waitFor(() => expect(screen.getByText('No zones')).toBeTruthy());

    fireEvent.press(screen.getByText('Connect Account'));
    expect(mockPush).toHaveBeenCalledWith('/connect');
  });

  test('lists zones with plan and account', async () => {
    wrap();

    await waitFor(() => expect(screen.getByText('acme.com')).toBeTruthy());
    expect(screen.getByText('Enterprise · Acme Corp')).toBeTruthy();
    expect(screen.getByText('side.dev')).toBeTruthy();
    expect(screen.getByText('2 zones · 2 accounts')).toBeTruthy();
  });

  test('filters zones by search query', async () => {
    wrap();
    await waitFor(() => expect(screen.getByText('acme.com')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('zone-search'), 'side');

    expect(screen.queryByText('acme.com')).toBeNull();
    expect(screen.getByText('side.dev')).toBeTruthy();
  });

  test('opens the zone detail with routing params', async () => {
    wrap();
    await waitFor(() => expect(screen.getByText('acme.com')).toBeTruthy());

    fireEvent.press(screen.getByText('acme.com'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/(zones)/[zoneId]',
      params: {
        zoneId: 'zone-1',
        connectionId: 'tok-1',
        name: 'acme.com',
      },
    });
  });
});
