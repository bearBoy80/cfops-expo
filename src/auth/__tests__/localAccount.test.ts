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
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  advanceOnboarding,
  completeOnboarding,
  createAccount,
  createOnboardingAccount,
  deleteAccount,
  getAccount,
  LocalAccountStorageError,
  setBiometricsEnabled,
  verifyPassword,
} from '../localAccount';

const mockDigestStringAsync = jest.mocked(Crypto.digestStringAsync);
const expectedDigest =
  'ce827f2498ac95ca6e058222da44d81a5c1007a6ea4d4edc16e1e066e3f61266';

beforeEach(() => {
  mockStore.clear();
  mockDigestStringAsync.mockReset();
  mockDigestStringAsync.mockImplementation(async (_algorithm, input) =>
    input === `cfops-local-account:v2\0${'ab'.repeat(16)}\0hunter2secret`
      ? expectedDigest
      : '00'.repeat(32),
  );
});

test('returns null when no local account exists', async () => {
  expect(await getAccount()).toBeNull();
});

test('rejects malformed local account data with a typed storage error', async () => {
  mockStore.set('local-account-v2', '{"name":"JT"}');

  await expect(getAccount()).rejects.toMatchObject({
    code: 'corrupt',
    name: 'LocalAccountStorageError',
  });
});

test('wraps SecureStore access failures with a typed storage error', async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockRejectedValueOnce(new Error('keychain unavailable'));

  await expect(getAccount()).rejects.toEqual(
    expect.objectContaining<Partial<LocalAccountStorageError>>({
      code: 'unavailable',
    }),
  );
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

test('persists version 2 for a normally created account', async () => {
  await createAccount('JT', 'hunter2secret', false);

  expect(JSON.parse(mockStore.get('local-account-v2') ?? 'null')).toMatchObject({
    passwordHashVersion: 2,
    name: 'JT',
  });
});

test('persists version 2 for an onboarding account', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );

  expect(JSON.parse(mockStore.get('local-account-v2') ?? 'null')).toMatchObject({
    passwordHashVersion: 2,
    onboardingStep: 'connect',
  });
});

test('verifies with the current hash without rewriting the stored account', async () => {
  await createAccount('JT', 'hunter2secret', false);
  const storedBefore = mockStore.get('local-account-v2');
  jest.mocked(SecureStore.setItemAsync).mockClear();
  mockDigestStringAsync.mockClear();

  await expect(verifyPassword('hunter2secret')).resolves.toBe(true);

  expect(mockStore.get('local-account-v2')).toBe(storedBefore);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(mockDigestStringAsync).toHaveBeenCalledWith(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `cfops-local-account:v2\0${'ab'.repeat(16)}\0hunter2secret`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
});

test('ignores unpublished version 1 data stored under its prior key', async () => {
  mockStore.set(
    'local-account-v1',
    JSON.stringify({
      name: 'Old JT',
      organization: '',
      email: '',
      saltHex: 'ab'.repeat(16),
      hashHex: expectedDigest,
      passwordHashVersion: 1,
      biometricsEnabled: false,
      onboardingComplete: true,
      onboardingStep: 'done',
      createdAt: 0,
    }),
  );

  await expect(getAccount()).resolves.toBeNull();
});

test('rejects an unknown password hash version as corrupt data', async () => {
  mockStore.set(
    'local-account-v2',
    JSON.stringify({
      name: 'JT',
      organization: '',
      email: '',
      saltHex: 'ab'.repeat(16),
      hashHex: expectedDigest,
      passwordHashVersion: 3,
      biometricsEnabled: false,
      onboardingComplete: true,
      onboardingStep: 'done',
      createdAt: 0,
    }),
  );

  await expect(getAccount()).rejects.toMatchObject({ code: 'corrupt' });
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

test('deletes the local account for explicit recovery', async () => {
  await createAccount('JT', 'hunter2secret', false);

  await deleteAccount();

  expect(await getAccount()).toBeNull();
});

test('persists an incomplete onboarding account and advances its step', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    true,
  );

  expect(await getAccount()).toMatchObject({
    organization: 'Acme',
    name: 'JT',
    email: 'jt@acme.com',
    biometricsEnabled: true,
    onboardingComplete: false,
    onboardingStep: 'connect',
  });

  await advanceOnboarding('done');
  expect((await getAccount())?.onboardingStep).toBe('done');
});

test('marks onboarding complete without changing the password hash', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  const hashBefore = (await getAccount())?.hashHex;

  await completeOnboarding();

  expect(await getAccount()).toMatchObject({
    onboardingComplete: true,
    onboardingStep: 'done',
    hashHex: hashBefore,
  });
});

test('treats a legacy account without onboarding fields as complete', async () => {
  await createAccount('Legacy User', 'hunter2secret', false);
  const current = JSON.parse(mockStore.get('local-account-v2')!);
  delete current.organization;
  delete current.email;
  delete current.onboardingComplete;
  delete current.onboardingStep;
  mockStore.set('local-account-v2', JSON.stringify(current));

  expect(await getAccount()).toMatchObject({
    name: 'Legacy User',
    organization: '',
    email: '',
    onboardingComplete: true,
    onboardingStep: 'done',
  });
});
