import { scrypt as nativeScrypt } from 'react-native-quick-crypto';

import { derivePasswordHash } from '../passwordHash';

const mockNativeScrypt = jest.mocked(nativeScrypt);

beforeEach(() => {
  mockNativeScrypt.mockClear();
});

test('preserves the persisted scrypt hash with the native callback adapter', async () => {
  await expect(
    derivePasswordHash('hunter2secret', 'ab'.repeat(16)),
  ).resolves.toBe(
    '82a32df0a7b7133ed1ec35f9cecbe1422070cbbf835bfbda77dcc780c605d9d2',
  );
});

test('rejects a native scrypt callback error', async () => {
  const nativeError = new Error('native scrypt unavailable');
  mockNativeScrypt.mockImplementationOnce(
    (_password, _salt, _keyLength, _options, callback) => {
      if (!callback) {
        throw new Error('Native scrypt callback was not provided');
      }

      callback(nativeError);
    },
  );

  await expect(derivePasswordHash('hunter2secret', 'ab'.repeat(16))).rejects.toBe(
    nativeError,
  );
});

test('rejects when native scrypt omits the derived key', async () => {
  mockNativeScrypt.mockImplementationOnce(
    (_password, _salt, _keyLength, _options, callback) => {
      if (!callback) {
        throw new Error('Native scrypt callback was not provided');
      }

      callback(null);
    },
  );

  await expect(derivePasswordHash('hunter2secret', 'ab'.repeat(16))).rejects.toThrow(
    'Native scrypt completed without a derived key',
  );
});
