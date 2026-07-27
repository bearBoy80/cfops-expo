import * as Crypto from 'expo-crypto';

export const CURRENT_PASSWORD_HASH_VERSION = 2;

export async function derivePasswordHash(
  password: string,
  saltHex: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `cfops-local-account:v2\0${saltHex}\0${password}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
}
