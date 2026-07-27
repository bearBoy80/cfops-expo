import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Text } from 'react-native';
import Onboarding from '../../../app/onboarding';
import Unlock from '../../../app/unlock';
import { AuthGateProvider, useAuth } from '../AuthGate';
import { createAccount, getAccount } from '../localAccount';
import { ThemeProvider } from '../../theme/ThemeContext';
import { accent } from '../../theme/tokens';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((length: number) => new Uint8Array(length).fill(0xab)),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));

jest.mock('lucide-react-native', () => ({
  LockKeyhole: () => null,
  ScanFace: () => null,
  ShieldCheck: () => null,
}));

function AuthStatusProbe() {
  const { status } = useAuth();
  return <Text testID="auth-status">{status}</Text>;
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <AuthGateProvider>
        {ui}
        <AuthStatusProbe />
      </AuthGateProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockStore.clear();
  jest
    .mocked(LocalAuthentication.hasHardwareAsync)
    .mockReset()
    .mockResolvedValue(false);
  jest
    .mocked(LocalAuthentication.isEnrolledAsync)
    .mockReset()
    .mockResolvedValue(false);
  jest
    .mocked(LocalAuthentication.authenticateAsync)
    .mockReset()
    .mockResolvedValue({ success: false, error: 'user_cancel' });
});

test('onboarding rejects short and mismatched passwords', async () => {
  renderWithProviders(<Onboarding />);

  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('password'), 'short');
  fireEvent.changeText(screen.getByTestId('confirm'), 'short');
  fireEvent.press(screen.getByText('Create Account'));

  expect(
    await screen.findByText('Password must be at least 8 characters.'),
  ).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('password'), 'longenough');
  fireEvent.changeText(screen.getByTestId('confirm'), 'different1');
  fireEvent.press(screen.getByText('Create Account'));

  expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
});

test('onboarding creates the local account and unlocks the gate', async () => {
  renderWithProviders(<Onboarding />);
  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('no-account'),
  );

  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');
  fireEvent.changeText(screen.getByTestId('confirm'), 'hunter2secret');
  fireEvent.press(screen.getByText('Create Account'));

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
  expect((await getAccount())?.name).toBe('JT');
});

test('unlock shows an error for the wrong password', async () => {
  await createAccount('JT', 'hunter2secret', false);
  renderWithProviders(<Unlock />);

  fireEvent.changeText(screen.getByTestId('password'), 'wrong');
  fireEvent.press(screen.getByText('Unlock'));

  expect(await screen.findByText('Incorrect password.')).toBeTruthy();
});

test('unlock opens the gate for the correct password', async () => {
  await createAccount('JT', 'hunter2secret', false);
  renderWithProviders(<Unlock />);
  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('locked'),
  );

  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');
  fireEvent.press(screen.getByText('Unlock'));

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
});

test('unlock opens the gate after successful biometric authentication', async () => {
  jest
    .mocked(LocalAuthentication.hasHardwareAsync)
    .mockResolvedValue(true);
  jest
    .mocked(LocalAuthentication.isEnrolledAsync)
    .mockResolvedValue(true);
  jest
    .mocked(LocalAuthentication.authenticateAsync)
    .mockResolvedValue({ success: true });
  await createAccount('JT', 'hunter2secret', true);

  renderWithProviders(<Unlock />);

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
  expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
    expect.objectContaining({ promptMessage: 'Unlock cloudflareOps' }),
  );
});

test('unlock presents its primary action as a full-width accent button', async () => {
  await createAccount('JT', 'hunter2secret', false);
  renderWithProviders(<Unlock />);
  await screen.findByText('Welcome back, JT');

  expect(screen.getByRole('button', { name: 'Unlock' })).toHaveStyle({
    alignItems: 'center',
    backgroundColor: accent.orange,
    minHeight: 52,
  });
});
