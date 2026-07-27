import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { AppState, Text, type AppStateStatus } from 'react-native';
import Onboarding from '../../../app/onboarding';
import Unlock from '../../../app/unlock';
import { AuthGateProvider, useAuth } from '../AuthGate';
import {
  advanceOnboarding,
  createAccount,
  createOnboardingAccount,
  getAccount,
} from '../localAccount';
import { ThemeProvider } from '../../theme/ThemeContext';
import { accent } from '../../theme/tokens';

const mockStore = new Map<string, string>();
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const appStateSpy = jest.spyOn(AppState, 'addEventListener');

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
  Activity: () => null,
  ArrowRight: () => null,
  Building2: () => null,
  Check: () => null,
  Cloud: () => null,
  KeyRound: () => null,
  Layers: () => null,
  LockKeyhole: () => null,
  Lock: () => null,
  Mail: () => null,
  ScanFace: () => null,
  ShieldCheck: () => null,
  Sparkles: () => null,
  User: () => null,
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
  appStateListeners.clear();
  appStateSpy.mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return {
      remove: jest.fn(() => {
        appStateListeners.delete(listener);
      }),
    };
  });
  jest
    .mocked(SecureStore.getItemAsync)
    .mockReset()
    .mockImplementation(async (key: string) => mockStore.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockReset()
    .mockImplementation(async (key: string, value: string) => {
      mockStore.set(key, value);
    });
  jest
    .mocked(SecureStore.deleteItemAsync)
    .mockReset()
    .mockImplementation(async (key: string) => {
      mockStore.delete(key);
    });
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

afterAll(() => appStateSpy.mockRestore());

test('runs the Figma onboarding flow and persists completion', async () => {
  renderWithProviders(<Onboarding />);
  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('no-account'),
  );

  fireEvent.press(await screen.findByText('Get Started'));
  fireEvent.changeText(screen.getByTestId('organization'), 'Acme');
  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('email'), 'jt@acme.com');
  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');
  fireEvent.changeText(screen.getByTestId('confirm'), 'hunter2secret');
  fireEvent.press(screen.getByText('Create Account'));

  expect(
    await screen.findByText('Bind Cloudflare accounts'),
  ).toBeTruthy();
  fireEvent.press(screen.getByText('Authorize with Cloudflare'));
  expect(
    await screen.findByText(
      'Cloudflare connections arrive in the next milestone. Skip for now to continue.',
    ),
  ).toBeTruthy();

  fireEvent.press(screen.getByText('Skip for now'));
  expect(await screen.findByText("You're all set")).toBeTruthy();
  fireEvent.press(screen.getByText('Enter Console'));

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
  expect(await getAccount()).toMatchObject({
    organization: 'Acme',
    email: 'jt@acme.com',
    onboardingComplete: true,
    onboardingStep: 'done',
  });
});

test('validates organization, email, password length, and confirmation', async () => {
  renderWithProviders(<Onboarding />);
  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('no-account'),
  );

  fireEvent.press(await screen.findByText('Get Started'));

  expect(
    screen.getByRole('button', { name: 'Create Account' }),
  ).toBeDisabled();
  expect(
    screen.getByText('Fill in all fields to continue'),
  ).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('organization'), 'Acme');
  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('email'), 'invalid');
  fireEvent.changeText(screen.getByTestId('password'), 'short');
  fireEvent.changeText(screen.getByTestId('confirm'), 'different');
  expect(screen.getByText('Enter a valid work email.')).toBeTruthy();
  expect(
    screen.getByText('Password must be at least 8 characters.'),
  ).toBeTruthy();
  expect(screen.getByText('Passwords do not match.')).toBeTruthy();
});

test('resumes an incomplete onboarding account at the persisted step', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  await advanceOnboarding('done');

  renderWithProviders(<Onboarding />);

  expect(await screen.findByText("You're all set")).toBeTruthy();
});

test('does not expose an interactive welcome step before resume finishes', () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(() => new Promise(() => undefined));

  renderWithProviders(<Onboarding />);

  expect(screen.getByTestId('onboarding-loading')).toBeTruthy();
  expect(screen.queryByText('Get Started')).toBeNull();
});

test('resumes a newly created onboarding account at the connect step', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );

  renderWithProviders(<Onboarding />);

  expect(
    await screen.findByText('Bind Cloudflare accounts'),
  ).toBeTruthy();
});

test('preserves create form values when returning from connect', async () => {
  renderWithProviders(<Onboarding />);
  fireEvent.press(await screen.findByText('Get Started'));
  fireEvent.changeText(screen.getByTestId('organization'), 'Acme');
  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('email'), 'jt@acme.com');
  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');
  fireEvent.changeText(screen.getByTestId('confirm'), 'hunter2secret');
  fireEvent.press(screen.getByText('Create Account'));

  await screen.findByText('Bind Cloudflare accounts');
  fireEvent.press(screen.getByText('Back'));

  expect((await screen.findByTestId('organization')).props.value).toBe('Acme');
  expect(screen.getByTestId('name').props.value).toBe('JT');
  expect(screen.getByTestId('email').props.value).toBe('jt@acme.com');
  expect(screen.getByTestId('password').props.value).toBe('hunter2secret');
  expect(screen.getByTestId('confirm').props.value).toBe('hunter2secret');
});

test('keeps the create step open when the local account cannot be persisted', async () => {
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error('keychain unavailable'));
  renderWithProviders(<Onboarding />);
  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('no-account'),
  );

  fireEvent.press(await screen.findByText('Get Started'));
  fireEvent.changeText(screen.getByTestId('organization'), 'Acme');
  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('email'), 'jt@acme.com');
  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');
  fireEvent.changeText(screen.getByTestId('confirm'), 'hunter2secret');
  fireEvent.press(screen.getByText('Create Account'));

  expect(
    await screen.findByText('Could not create the local account. Try again.'),
  ).toBeTruthy();
  expect(screen.getByText('Create your account')).toBeTruthy();
  expect(await getAccount()).toBeNull();

  fireEvent.press(screen.getByText('Create Account'));
  expect(
    await screen.findByText('Bind Cloudflare accounts'),
  ).toBeTruthy();
});

test('keeps the connect step open when progress cannot be persisted', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error('keychain unavailable'));

  renderWithProviders(<Onboarding />);
  fireEvent.press(await screen.findByText('Skip for now'));

  expect(
    await screen.findByText(
      'Could not save onboarding progress. Try again.',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Bind Cloudflare accounts')).toBeTruthy();
  expect((await getAccount())?.onboardingStep).toBe('connect');

  fireEvent.press(screen.getByText('Skip for now'));
  expect(await screen.findByText("You're all set")).toBeTruthy();
});

test('does not unlock when onboarding completion cannot be persisted', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  await advanceOnboarding('done');
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error('keychain unavailable'));

  renderWithProviders(<Onboarding />);
  fireEvent.press(await screen.findByText('Enter Console'));

  expect(
    await screen.findByText('Could not finish setup. Try again.'),
  ).toBeTruthy();
  expect(screen.getByTestId('auth-status').props.children).not.toBe('unlocked');

  fireEvent.press(screen.getByText('Enter Console'));
  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
});

test('stays locked when completion crosses a background transition', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  await advanceOnboarding('done');

  let resolveWrite: (() => void) | undefined;
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementationOnce(
      (key: string, value: string) =>
        new Promise<void>((resolve) => {
          resolveWrite = () => {
            mockStore.set(key, value);
            resolve();
          };
        }),
    );

  renderWithProviders(<Onboarding />);
  fireEvent.press(await screen.findByText('Enter Console'));
  await waitFor(() =>
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(3),
  );
  expect(
    screen.getByRole('button', { name: 'Enter Console' }),
  ).toBeDisabled();

  act(() => {
    appStateListeners.forEach((listener) => listener('background'));
    appStateListeners.forEach((listener) => listener('active'));
  });
  await act(async () => {
    resolveWrite?.();
  });

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('locked'),
  );
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
