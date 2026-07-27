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

import {
  createAccount,
  getAccount,
  setBiometricsEnabled,
  verifyPassword,
} from '../localAccount';

beforeEach(() => mockStore.clear());

test('returns null when no local account exists', async () => {
  expect(await getAccount()).toBeNull();
});

test('stores only a salted password hash and verifies the password', async () => {
  await createAccount('JT', 'hunter2secret', false);

  const account = await getAccount();
  expect(account?.name).toBe('JT');
  expect(account?.saltHex).toMatch(/^[0-9a-f]{32}$/);
  expect(account?.hashHex).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(account)).not.toContain('hunter2secret');
  expect(await verifyPassword('hunter2secret')).toBe(true);
  expect(await verifyPassword('wrong')).toBe(false);
});

test('uses native random bytes for the password salt', async () => {
  await createAccount('JT', 'hunter2secret', false);

  expect((await getAccount())?.saltHex).toBe('ab'.repeat(16));
});

test('persists the biometric unlock preference', async () => {
  await createAccount('JT', 'hunter2secret', false);

  await setBiometricsEnabled(true);

  expect((await getAccount())?.biometricsEnabled).toBe(true);
});

test('rejects biometric preference changes before an account exists', async () => {
  await expect(setBiometricsEnabled(true)).rejects.toThrow('no local account');
});
