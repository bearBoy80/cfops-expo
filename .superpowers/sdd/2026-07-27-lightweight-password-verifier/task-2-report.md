# Task 2 — Lightweight password verifier report

## Scope

- Replaced the removed Quick Crypto scrypt path with Expo Crypto's SHA-256
  `digestStringAsync` boundary.
- Added the version-2, domain-separated verifier input
  `cfops-local-account:v2\0<saltHex>\0<password>` and the supplied digest
  vector.
- Added `passwordHashVersion: 2`, the `local-account-v2` SecureStore key, and
  local hexadecimal encoding for Expo Crypto random bytes.
- Parsing now accepts exactly password-hash version 2; missing and unknown
  versions are corrupt. Password verification derives the current hash and
  leaves storage untouched.

## TDD evidence

### RED

1. `npm test -- --runInBand src/auth/__tests__/passwordHash.test.ts`
   failed before verifier implementation. Jest reported
   `Cannot find module 'react-native-quick-crypto' from 'src/auth/passwordHash.ts'`.
   This confirmed the prior implementation depended on the package removed in
   Task 1.
2. `npm test -- --runInBand src/auth/__tests__/localAccount.test.ts`
   failed before the schema implementation: v2-key tests could not find stored
   values, v1 data was still read, and unknown v2 versions were not rejected.
   Eight tests failed, including both account-creation version assertions,
   v1-key isolation, and unknown-version corruption.
3. `npm test -- --runInBand` initially failed in the existing
   `screens.test.tsx` and `AuthGate.test.tsx` integration fixtures. The RED
   failures showed their Expo Crypto mocks lacked the new native digest API and
   their deferred reads still used `local-account-v1`.

### GREEN

1. Focused verifier/account tests:
   `npm test -- --runInBand src/auth/__tests__/passwordHash.test.ts src/auth/__tests__/localAccount.test.ts`
   — 2 suites, 18 tests passed.
2. After the scope clarification below, affected integration tests:
   `npm test -- --runInBand src/auth/__tests__/AuthGate.test.tsx src/auth/__tests__/screens.test.tsx`
   — 2 suites, 39 tests passed.
3. Full suite:
   `npm test -- --runInBand` — 10 suites, 75 tests passed.
4. TypeScript:
   `npx tsc --noEmit` — passed with exit code 0.
5. `git diff --check` — passed with exit code 0.

## Integration-fixture scope clarification

The brief initially named four auth verifier files. Full-suite RED established
that `src/auth/__tests__/AuthGate.test.tsx` and
`src/auth/__tests__/screens.test.tsx` are direct consumers of the changed
SecureStore schema and Expo Crypto boundary. The task owner explicitly
authorized minimal fixture-only updates: add
`CryptoDigestAlgorithm`, `CryptoEncoding`, and `digestStringAsync` to their
existing Expo Crypto mocks, and replace only hardcoded
`local-account-v1` reads/expectations with `local-account-v2`. No production
UI behavior changed.

## Self-review

- No scrypt, Quick Crypto, Noble import, migration, or v1 fallback was added to
  `src/auth` production code.
- The account tests exercise real production hash/account code; mocks stop at
  Expo Crypto native methods and SecureStore.
- The stored password remains a salt and hash only; no plaintext password is
  persisted.

## Review fix 1/5 — faithful Expo Crypto native boundary doubles

### Root cause and change

The original Expo Crypto doubles were not cryptographic boundaries: the
password-hash test always returned the expected vector, while account and UI
fixtures returned conditional, constant, or polynomial values. Consequently,
some incorrect verifier inputs or options could still pass.

All four affected fixtures now use `jest.requireActual('crypto')` and Node
`createHash('sha256')` over the *actual* supplied UTF-8 input, returning a hex
digest. Each double exposes `CryptoDigestAlgorithm.SHA256` and
`CryptoEncoding.HEX`, and rejects any other algorithm or encoding. The test
fixture remains the native Expo Crypto boundary; production code was not
changed.

Added an otherwise-valid `local-account-v2` fixture that omits only
`passwordHashVersion`; it rejects with `LocalAccountStorageError` and code
`corrupt`.

### RED mutation evidence

After installing the faithful boundary doubles, temporary, uncommitted
mutations to `src/auth/passwordHash.ts` produced the expected failures in
`src/auth/__tests__/passwordHash.test.ts`:

1. Changing the domain from `v2` to `v3` changed the independently computed
   digest and failed the supplied vector assertion.
2. Changing SHA-256 to SHA-1 was rejected as unexpected native digest options.
3. Changing hex output to base64 was rejected as unexpected native digest
   options.
4. Replacing the supplied password with a literal changed the independently
   computed digest and failed the vector assertion.

All mutations were reverted before final verification.

### Final verification

1. `npm test -- --runInBand src/auth/__tests__/passwordHash.test.ts src/auth/__tests__/localAccount.test.ts src/auth/__tests__/AuthGate.test.tsx src/auth/__tests__/screens.test.tsx`
   — 4 suites, 58 tests passed.
2. `npm test -- --runInBand` — 10 suites, 76 tests passed.
3. `npx tsc --noEmit` — passed with exit code 0.
4. `git diff --check` — passed with exit code 0.

The first TypeScript run exposed that this project does not enable Node type
definitions for `typeof import('crypto')`. The doubles therefore use a local
minimal type assertion around `jest.requireActual('crypto')`; the runtime hash
behavior and coverage remain unchanged, and no dependency was added.
