import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import SettingsScreen from '@/app/(tabs)/(settings)/index';
import type { LocalAccount } from '../auth/localAccount';
import { getAccount, setBiometricsEnabled } from '../auth/localAccount';
import {
  listConnections,
  removeConnection,
} from '../cloudflare/connections';
import { ThemeProvider } from '../theme/ThemeContext';

const mockPush = jest.fn();
const mockLock = jest.fn();
const mockReportAccountError = jest.fn();

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
    // Screens are always "focused" in tests, so behave like useEffect.
    useFocusEffect: (callback: () => void | (() => void)) => {
      useEffect(callback, [callback]);
    },
  };
});

jest.mock('../auth/AuthGate', () => ({
  useAuth: () => ({
    lock: mockLock,
    reportAccountError: mockReportAccountError,
  }),
}));

jest.mock('../auth/localAccount', () => ({
  getAccount: jest.fn(),
  setBiometricsEnabled: jest.fn(),
}));

jest.mock('../cloudflare/connections', () => ({
  listConnections: jest.fn(),
  removeConnection: jest.fn(),
}));

const account: LocalAccount = {
  name: 'Sarah Anderson',
  organization: 'Acme Corp',
  email: 'sarah@acme.com',
  saltHex: 'ab'.repeat(16),
  hashHex: 'cd'.repeat(32),
  passwordHashVersion: 2,
  biometricsEnabled: false,
  onboardingComplete: true,
  onboardingStep: 'done',
  createdAt: 1700000000000,
};

const connection = {
  id: 'tok-1',
  label: 'Ops token',
  authType: 'token' as const,
  accounts: [
    { id: 'acc-1', name: 'Acme Corp' },
    { id: 'acc-2', name: 'Side Project' },
  ],
  createdAt: 1700000000000,
};

const wrap = () =>
  render(
    <ThemeProvider>
      <SettingsScreen />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAccount).mockResolvedValue(account);
  jest.mocked(setBiometricsEnabled).mockResolvedValue();
  jest.mocked(listConnections).mockResolvedValue([]);
  jest.mocked(removeConnection).mockResolvedValue();
});

describe('Settings tab', () => {
  test('shows the local account profile', async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText('Sarah Anderson')).toBeTruthy(),
    );
    expect(screen.getByText('sarah@acme.com · Acme Corp')).toBeTruthy();
    expect(screen.getByText('No accounts connected')).toBeTruthy();
  });

  test('navigates to the connect screen', async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText('Connect Account')).toBeTruthy(),
    );

    fireEvent.press(screen.getByText('Connect Account'));

    expect(mockPush).toHaveBeenCalledWith('/connect');
  });

  test('lists discovered Cloudflare accounts', async () => {
    jest.mocked(listConnections).mockResolvedValue([connection]);
    wrap();

    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeTruthy());
    expect(screen.getByText('Side Project')).toBeTruthy();
    expect(screen.getByText('Connected Accounts · 2')).toBeTruthy();
    expect(screen.queryByText('No accounts connected')).toBeNull();
  });

  test('disconnects a credential after confirmation', async () => {
    jest.mocked(listConnections).mockResolvedValue([connection]);
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((button) => button.style === 'destructive')?.onPress?.();
      });
    wrap();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeTruthy());

    fireEvent.press(screen.getByText('Acme Corp'));

    await waitFor(() =>
      expect(removeConnection).toHaveBeenCalledWith('tok-1'),
    );
    alertSpy.mockRestore();
  });

  test('reports account errors from corrupt storage', async () => {
    jest
      .mocked(getAccount)
      .mockRejectedValue(new Error('corrupt'));
    wrap();

    await waitFor(() => expect(mockReportAccountError).toHaveBeenCalled());
  });

  test('toggles the theme between dark and light', async () => {
    wrap();
    const toggle = await screen.findByTestId('dark-appearance');
    expect(toggle.props.value).toBe(true);

    fireEvent(toggle, 'valueChange', false);

    expect(screen.getByTestId('dark-appearance').props.value).toBe(false);
  });

  test('persists the biometric preference', async () => {
    wrap();
    const toggle = await screen.findByTestId('biometrics');
    await waitFor(() => expect(toggle.props.value).toBe(false));

    fireEvent(toggle, 'valueChange', true);

    expect(setBiometricsEnabled).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(screen.getByTestId('biometrics').props.value).toBe(true),
    );
  });

  test('reverts the biometric toggle when persistence fails', async () => {
    jest
      .mocked(setBiometricsEnabled)
      .mockRejectedValue(new Error('unavailable'));
    wrap();
    const toggle = await screen.findByTestId('biometrics');

    fireEvent(toggle, 'valueChange', true);

    await waitFor(() =>
      expect(
        screen.getByText('Could not save the preference. Try again.'),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId('biometrics').props.value).toBe(false);
  });

  test('locks the console', async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText('Sarah Anderson')).toBeTruthy(),
    );

    fireEvent.press(screen.getByText('Lock Console'));

    expect(mockLock).toHaveBeenCalled();
  });
});
