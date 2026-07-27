import { scryptAsync } from '@noble/hashes/scrypt.js';
import {
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
} from '@noble/hashes/utils.js';

const SCRYPT_PARAMS = {
  N: 2 ** 14,
  r: 8,
  p: 1,
  dkLen: 32,
  asyncTick: 8,
};

export async function derivePasswordHash(
  password: string,
  saltHex: string,
): Promise<string> {
  return bytesToHex(
    await scryptAsync(
      utf8ToBytes(password),
      hexToBytes(saltHex),
      SCRYPT_PARAMS,
    ),
  );
}
