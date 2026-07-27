jest.mock('react-native-quick-crypto', () => {
  const { Buffer } = require('node:buffer');
  const { scrypt } = require('node:crypto');

  return {
    Buffer,
    scrypt: jest.fn((password, salt, keyLength, options, callback) => {
      scrypt(password, salt, keyLength, options, callback);
    }),
  };
});
