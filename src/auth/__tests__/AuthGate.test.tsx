import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
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

beforeEach(() => mockStore.clear());

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
