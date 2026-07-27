import * as SecureStore from 'expo-secure-store';
import { scrypt } from '@noble/hashes/scrypt.js';
import {
  bytesToHex,
  hexToBytes,
  randomBytes,
  utf8ToBytes,
} from '@noble/hashes/utils.js';

const STORAGE_KEY = 'local-account-v1';
const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 };

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

export async function getAccount(): Promise<LocalAccount | null> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEY);
  return stored ? (JSON.parse(stored) as LocalAccount) : null;
}

export async function createAccount(
  name: string,
  password: string,
  biometricsEnabled: boolean,
): Promise<void> {
  const saltHex = bytesToHex(randomBytes(16));
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
