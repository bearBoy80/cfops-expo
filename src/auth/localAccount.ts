import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { scrypt } from '@noble/hashes/scrypt.js';
import {
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
} from '@noble/hashes/utils.js';

const STORAGE_KEY = 'local-account-v1';
const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 };

export type LocalAccountStorageErrorCode = 'corrupt' | 'unavailable';

export class LocalAccountStorageError extends Error {
  readonly code: LocalAccountStorageErrorCode;

  constructor(code: LocalAccountStorageErrorCode) {
    super(
      code === 'corrupt'
        ? 'The local account data is invalid.'
        : 'The local account storage is unavailable.',
    );
    this.name = 'LocalAccountStorageError';
    this.code = code;
  }
}

export interface LocalAccount {
  name: string;
  saltHex: string;
  hashHex: string;
  biometricsEnabled: boolean;
  createdAt: number;
}

function hashPassword(password: string, saltHex: string): string {
  return bytesToHex(
    scrypt(utf8ToBytes(password), hexToBytes(saltHex), SCRYPT_PARAMS),
  );
}

function isHex(value: unknown, length: number): value is string {
  return (
    typeof value === 'string' &&
    value.length === length &&
    /^[0-9a-f]+$/i.test(value)
  );
}

function parseAccount(stored: string): LocalAccount {
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    throw new LocalAccountStorageError('corrupt');
  }

  if (!value || typeof value !== 'object') {
    throw new LocalAccountStorageError('corrupt');
  }

  const candidate = value as Partial<LocalAccount>;
  if (
    typeof candidate.name !== 'string' ||
    candidate.name.trim().length === 0 ||
    !isHex(candidate.saltHex, 32) ||
    !isHex(candidate.hashHex, 64) ||
    typeof candidate.biometricsEnabled !== 'boolean' ||
    typeof candidate.createdAt !== 'number' ||
    !Number.isFinite(candidate.createdAt)
  ) {
    throw new LocalAccountStorageError('corrupt');
  }

  return candidate as LocalAccount;
}

export async function getAccount(): Promise<LocalAccount | null> {
  let stored: string | null;
  try {
    stored = await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    throw new LocalAccountStorageError('unavailable');
  }

  return stored ? parseAccount(stored) : null;
}

export async function createAccount(
  name: string,
  password: string,
  biometricsEnabled: boolean,
): Promise<void> {
  const saltHex = bytesToHex(getRandomBytes(16));
  const account: LocalAccount = {
    name,
    saltHex,
    hashHex: hashPassword(password, saltHex),
    biometricsEnabled,
    createdAt: Date.now(),
  };

  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(account));
}

export async function verifyPassword(password: string): Promise<boolean> {
  const account = await getAccount();
  return account
    ? hashPassword(password, account.saltHex) === account.hashHex
    : false;
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  const account = await getAccount();
  if (!account) {
    throw new Error('no local account');
  }

  await SecureStore.setItemAsync(
    STORAGE_KEY,
    JSON.stringify({ ...account, biometricsEnabled: enabled }),
  );
}

export async function deleteAccount(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    throw new LocalAccountStorageError('unavailable');
  }
}
