import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { AuthGateProvider, useAuth } from '../AuthGate';
import { createAccount } from '../localAccount';

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

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthGateProvider>{children}</AuthGateProvider>
);

let appStateListener: ((state: AppStateStatus) => void) | undefined;
const appStateSpy = jest.spyOn(AppState, 'addEventListener');

beforeEach(() => {
  mockStore.clear();
  appStateListener = undefined;
  appStateSpy.mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  });
});

afterAll(() => appStateSpy.mockRestore());

test('moves from loading to no-account when no local account exists', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });

  expect(result.current.status).toBe('loading');
  await waitFor(() => expect(result.current.status).toBe('no-account'));
});

test('loads an existing account as locked and supports lock transitions', async () => {
  await createAccount('JT', 'hunter2secret', false);
  const { result } = renderHook(() => useAuth(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe('locked'));

  act(() => result.current.unlock());
  expect(result.current.status).toBe('unlocked');

  act(() => result.current.lock());
  expect(result.current.status).toBe('locked');
});

test('moves directly to unlocked after account creation', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('no-account'));

  act(() => result.current.onAccountCreated());

  expect(result.current.status).toBe('unlocked');
});

test('relocks an unlocked account when the app leaves the foreground', async () => {
  await createAccount('JT', 'hunter2secret', false);
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('locked'));

  act(() => result.current.unlock());
  act(() => appStateListener?.('background'));

  expect(result.current.status).toBe('locked');
});

test('rejects a late unlock completion while the app is backgrounded', async () => {
  await createAccount('JT', 'hunter2secret', false);
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('locked'));

  act(() => appStateListener?.('background'));
  act(() => result.current.unlock());

  expect(result.current.status).toBe('locked');

  act(() => appStateListener?.('active'));
  act(() => result.current.unlock());

  expect(result.current.status).toBe('unlocked');
});

test('rejects late account creation completion while backgrounded', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('no-account'));

  act(() => appStateListener?.('background'));
  act(() => result.current.onAccountCreated());

  expect(result.current.status).toBe('no-account');
});

test('surfaces corrupt storage and supports an explicit local reset', async () => {
  mockStore.set('local-account-v1', '{"name":"JT"}');
  const { result } = renderHook(() => useAuth(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.errorMessage).toBeTruthy();

  await act(async () => result.current.resetAccount());

  expect(result.current.status).toBe('no-account');
  expect(mockStore.has('local-account-v1')).toBe(false);
});
