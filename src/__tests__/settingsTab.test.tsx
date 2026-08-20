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

jest.mock('../components/ui/actionMenu', () => ({
  ActionMenuHost: () => null,
  showActionMenu: jest.fn(),
}));

const { showActionMenu } = jest.requireMock<{
  showActionMenu: jest.Mock;
}>('../components/ui/actionMenu');

/** Options of the most recently shown confirmation sheet. */
const lastSheet = () =>
  showActionMenu.mock.calls[showActionMenu.mock.calls.length - 1][0] as {
    message: string;
    actions: { destructive?: boolean; onPress: () => void }[];
  };

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

  test('groups discovered accounts under their credential', async () => {
    jest.mocked(listConnections).mockResolvedValue([connection]);
    wrap();

    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeTruthy());
    expect(screen.getByText('Side Project')).toBeTruthy();
    // The credential is its own row, and says how many accounts it covers
    // instead of echoing one account name onto every row.
    expect(screen.getByText('Ops token')).toBeTruthy();
    expect(screen.getByText('API Token · 2 accounts')).toBeTruthy();
    expect(screen.getByText('Connected Accounts · 2')).toBeTruthy();
    expect(screen.queryByText('No accounts connected')).toBeNull();
  });

  test('folds the accounts away and back', async () => {
    jest.mocked(listConnections).mockResolvedValue([connection]);
    wrap();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeTruthy());

    // Expanded by default: nothing is hidden until the user folds it.
    expect(
      screen.getByTestId('credential-tok-1').props.accessibilityState.expanded,
    ).toBe(true);

    fireEvent.press(screen.getByTestId('credential-tok-1'));

    expect(screen.queryByText('Acme Corp')).toBeNull();
    expect(screen.queryByText('Side Project')).toBeNull();
    // The credential itself and its summary stay visible while folded.
    expect(screen.getByText('Ops token')).toBeTruthy();
    expect(screen.getByText('API Token · 2 accounts')).toBeTruthy();
    expect(
      screen.getByTestId('credential-tok-1').props.accessibilityState.expanded,
    ).toBe(false);

    fireEvent.press(screen.getByTestId('credential-tok-1'));
    expect(screen.getByText('Acme Corp')).toBeTruthy();
  });

  test('hides the disconnect action while folded', async () => {
    jest.mocked(listConnections).mockResolvedValue([connection]);
    wrap();
    await waitFor(() =>
      expect(screen.getByTestId('disconnect-tok-1')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('credential-tok-1'));

    expect(screen.queryByTestId('disconnect-tok-1')).toBeNull();
  });

  test('disconnects from its own row, never from an account', async () => {
    jest.mocked(listConnections).mockResolvedValue([connection]);
    showActionMenu.mockImplementation(
      (options: { actions: { destructive?: boolean; onPress: () => void }[] }) => {
        options.actions.find((action) => action.destructive)?.onPress();
      },
    );
    wrap();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeTruthy());

    // Pressing an account must not remove the credential that covers others.
    fireEvent.press(screen.getByText('Acme Corp'));
    expect(removeConnection).not.toHaveBeenCalled();

    // Nor may folding the group be mistaken for removing it.
    fireEvent.press(screen.getByTestId('credential-tok-1'));
    expect(removeConnection).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('credential-tok-1'));

    fireEvent.press(screen.getByTestId('disconnect-tok-1'));

    await waitFor(() =>
      expect(removeConnection).toHaveBeenCalledWith('tok-1'),
    );
  });

  test('warns that every covered account loses access', async () => {
    jest.mocked(listConnections).mockResolvedValue([connection]);
    wrap();
    await waitFor(() =>
      expect(screen.getByTestId('disconnect-tok-1')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('disconnect-tok-1'));

    expect(lastSheet().message).toContain('All 2 accounts');
  });

  test('reports account errors from corrupt storage', async () => {
    jest
      .mocked(getAccount)
      .mockRejectedValue(new Error('corrupt'));
    wrap();

    await waitFor(() => expect(mockReportAccountError).toHaveBeenCalled());
  });

  test('switches the appearance preference', async () => {
    wrap();
    const light = await screen.findByTestId('appearance-light');
    expect(
      screen.getByTestId('appearance-system').props.accessibilityState.selected,
    ).toBe(true);

    fireEvent.press(light);

    expect(
      screen.getByTestId('appearance-light').props.accessibilityState.selected,
    ).toBe(true);
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
