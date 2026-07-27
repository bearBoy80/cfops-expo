# Lightweight Password Verifier Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make normal unlocks complete in milliseconds in Expo Go while preserving existing local accounts through a one-time legacy migration.

**Architecture:** New account records carry `passwordHashVersion: 2` and store a salted, domain-separated SHA-256 verifier produced by Expo Crypto. Records without the field are legacy scrypt records. A correct legacy password is verified once and immediately rewrites the same SecureStore record to version 2; incorrect input never mutates it.

**Tech Stack:** Expo SDK 57, Expo Crypto, Expo SecureStore, TypeScript, Jest/jest-expo, `@noble/hashes` only for legacy migration.

---

### Task 1: Remove the native development-build experiment

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`
- Modify: `jest.config.js`
- Delete: `jest.setup.js`

**Step 1: Remove native-only dependencies**

Run:

```sh
npm uninstall react-native-quick-crypto react-native-nitro-modules react-native-quick-base64 expo-dev-client expo-build-properties
```

Keep `expo-crypto`, `expo-secure-store`, and `@noble/hashes`.

**Step 2: Remove configuration**

Remove the Quick Crypto and build-properties Expo plugins and the
`start:dev-client` / `ios:dev` scripts. Remove the Quick Crypto Jest setup and
restore the prior Jest config. Preserve all unrelated plugins and scripts.

**Step 3: Verify the managed workflow**

Run:

```sh
npx expo config --type public
npx expo install --check
git diff --check
```

Expected: config resolves, dependencies are compatible, and no native-only
package or plugin remains.

**Step 4: Commit**

```sh
git add package.json package-lock.json app.json jest.config.js jest.setup.js
git commit -m "build: 恢复 Expo Go 认证运行时"
```

### Task 2: Implement the current verifier and legacy migration using TDD

**Files:**
- Modify: `src/auth/passwordHash.ts`
- Modify: `src/auth/localAccount.ts`
- Modify: `src/auth/__tests__/passwordHash.test.ts`
- Modify: `src/auth/__tests__/localAccount.test.ts`

**Step 1: Write failing verifier tests**

Before production changes, add tests proving:

- the current verifier calls Expo Crypto SHA-256 with hexadecimal output over
  `cfops-local-account:v2\0<saltHex>\0<password>`;
- password `hunter2secret` with salt `ab` repeated 16 times returns the
  independently precomputed lowercase digest
  `ce827f2498ac95ca6e058222da44d81a5c1007a6ea4d4edc16e1e066e3f61266`;
- the legacy helper still produces the existing persisted scrypt vector.

Mock only Expo Crypto's native digest boundary. Verify RED because production
still imports Quick Crypto.

**Step 2: Implement the minimal verifier**

Export `CURRENT_PASSWORD_HASH_VERSION = 2`,
`derivePasswordHash(password, saltHex)`, and
`deriveLegacyPasswordHash(password, saltHex)`.

The current function must call `digestStringAsync` with SHA-256 and hexadecimal
encoding. The legacy function must retain exactly `N = 2^14`, `r = 8`, `p = 1`,
and a 32-byte result. It exists only for versionless record migration.

**Step 3: Write failing account migration tests**

Add behavior tests proving:

- newly created normal and onboarding accounts persist version 2;
- version 2 verification uses the current verifier without rewriting storage;
- a correct versionless legacy password rewrites the complete account with the
  same salt, a current digest, and version 2;
- an incorrect legacy password returns false and does not write storage;
- unknown verifier versions are rejected as corrupt data.

Verify RED before modifying `localAccount.ts`.

**Step 4: Implement migration**

Add `passwordHashVersion?: 2` to `LocalAccount`. New accounts always set it.
Parsing accepts an absent field as legacy and accepts exactly version 2;
everything else is corrupt.

`verifyPassword` selects the current verifier for version 2. For a versionless
record, compare the legacy hash. Only on success derive the current hash and
save `{ ...account, hashHex, passwordHashVersion: 2 }` before returning true.

**Step 5: Verify**

Run:

```sh
npm test -- --runInBand src/auth/__tests__/passwordHash.test.ts src/auth/__tests__/localAccount.test.ts
npm test -- --runInBand
npx tsc --noEmit
```

Expected: all pass with no warnings.

**Step 6: Commit**

```sh
git add src/auth/passwordHash.ts src/auth/localAccount.ts src/auth/__tests__/passwordHash.test.ts src/auth/__tests__/localAccount.test.ts
git commit -m "perf: 使用轻量密码校验并迁移旧账户"
```

### Task 3: Verify Expo Go unlock behavior

**Files:**
- Create: `.superpowers/sdd/2026-07-27-lightweight-password-verifier/native-verification-report.md`

**Step 1: Start Expo Go**

Run Metro on a free port and open the existing iOS Simulator without clearing
SecureStore data.

**Step 2: Verify migration**

Unlock the versionless existing account once without recording its password.
Confirm the account reaches the five-tab app and that the next launch uses the
current verifier.

**Step 3: Measure the normal path**

Measure from current-verifier password submission to the five-tab app. Target
at most 250 ms on the iOS Simulator. Confirm first-frame busy feedback, wrong
password behavior, duplicate-submit prevention, and manual-only biometrics.

**Step 4: Run final checks and record evidence**

```sh
npm test -- --runInBand
npx tsc --noEmit
git status --short
```

Write timings, pass/fail results, and environment limitations to the report.
Never write the password.

**Step 5: Commit**

```sh
git add .superpowers/sdd/2026-07-27-lightweight-password-verifier/native-verification-report.md
git commit -m "test: 记录轻量 unlock 性能验证"
```
