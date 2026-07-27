# Lightweight Password Verifier Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make unlocks complete in milliseconds in Expo Go with one lightweight verifier and no pre-release compatibility code.

**Architecture:** Account records carry `passwordHashVersion: 2` and store a salted, domain-separated SHA-256 verifier produced by Expo Crypto. The SecureStore key is bumped to `local-account-v2`, so unpublished v1 test data is ignored and onboarding creates a fresh account.

**Tech Stack:** Expo SDK 57, Expo Crypto, Expo SecureStore, TypeScript, Jest/jest-expo.

---

### Task 1: Remove the native development-build experiment

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`
- Modify: `jest.config.js`
- Delete: `jest.setup.js`

**Step 1: Remove superseded crypto dependencies**

Run:

```sh
npm uninstall react-native-quick-crypto react-native-nitro-modules react-native-quick-base64 expo-dev-client expo-build-properties @noble/hashes
```

Keep `expo-crypto` and `expo-secure-store`.

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

Expected: config resolves, dependencies are compatible, and no Quick Crypto,
development-client, Nitro, or Noble package remains.

**Step 4: Commit**

```sh
git add package.json package-lock.json app.json jest.config.js jest.setup.js
git commit -m "build: 恢复 Expo Go 认证运行时"
```

### Task 2: Implement the version 2 verifier using TDD

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

Mock only Expo Crypto's native digest boundary. Verify RED because production
still imports Quick Crypto.

**Step 2: Implement the minimal verifier**

Export `CURRENT_PASSWORD_HASH_VERSION = 2` and
`derivePasswordHash(password, saltHex)`.

The current function must call `digestStringAsync` with SHA-256 and hexadecimal
encoding. Do not add scrypt or any fallback.

**Step 3: Write failing account version tests**

Add behavior tests proving:

- newly created normal and onboarding accounts persist version 2;
- verification uses the current verifier without rewriting storage;
- the storage key is `local-account-v2`, isolating unpublished v1 data;
- unknown verifier versions are rejected as corrupt data.

Verify RED before modifying `localAccount.ts`.

**Step 4: Implement the v2 account schema**

Add required `passwordHashVersion: 2` to `LocalAccount`. New accounts always set
it. Parsing accepts exactly version 2; absent or unknown versions are corrupt.
Bump the storage key from `local-account-v1` to `local-account-v2`.

Replace Noble's `bytesToHex` import with a small local conversion of the
16 random bytes returned by Expo Crypto. `verifyPassword` derives the current
digest and compares it with the stored digest; it never rewrites storage.

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

### Task 3: Verify fresh Expo Go unlock behavior

**Files:**
- Create: `.superpowers/sdd/2026-07-27-lightweight-password-verifier/native-verification-report.md`

**Step 1: Start Expo Go**

Run Metro on a free port and open the existing iOS Simulator without clearing
SecureStore data.

**Step 2: Verify the fresh v2 flow**

Confirm unpublished v1 SecureStore data is ignored, complete onboarding to
create a v2 account, close/reopen the app, and confirm it starts at Unlock.

**Step 3: Measure the normal path**

Measure from password submission to the five-tab app. Target at most 250 ms on
the iOS Simulator. Confirm first-frame busy feedback, wrong
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
