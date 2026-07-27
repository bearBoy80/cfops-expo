import { Buffer, scrypt } from 'react-native-quick-crypto';

const SCRYPT_OPTIONS = {
  N: 2 ** 14,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

export async function derivePasswordHash(
  password: string,
  saltHex: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(
      Buffer.from(password, 'utf8'),
      Buffer.from(saltHex, 'hex'),
      32,
      SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        if (!derivedKey) {
          reject(new Error('Native scrypt completed without a derived key'));
          return;
        }

        resolve(derivedKey.toString('hex'));
      },
    );
  });
}
