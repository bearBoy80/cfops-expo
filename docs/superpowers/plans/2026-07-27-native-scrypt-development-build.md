# Native Scrypt Development Build Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace the Hermes-bound password derivation with native asynchronous scrypt while preserving every existing account hash.

**Architecture:** `passwordHash.ts` wraps `react-native-quick-crypto`'s callback API in a Promise and converts UTF-8 passwords and hexadecimal salts with the package's Buffer export. Expo config includes the native plugin and development-client dependencies. There is no JavaScript fallback: a missing native module must fail visibly as a build/configuration error.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Jest/jest-expo, react-native-quick-crypto 1.1.6, Nitro Modules, Expo development builds.

---

### Task 1: Configure the native development runtime

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`

**Step 1: Install compatible packages**

Run:

```sh
npx expo install expo-dev-client expo-build-properties
npm install react-native-quick-crypto@1.1.6 react-native-nitro-modules@0.33.2 react-native-quick-base64@3.0.1
```

Use Nitro `0.33.2`, the version used by Quick Crypto 1.1.6 itself. If native
compilation proves it incompatible with React Native 0.86, upgrade Nitro to the
latest peer-compatible release and record the reason.

**Step 2: Configure Expo and scripts**

Add `react-native-quick-crypto` to `expo.plugins`. Add:

```json
"start:dev-client": "expo start --dev-client",
"ios:dev": "expo run:ios"
```

Keep existing scripts working. Do not commit generated `ios/` or `android/`
directories when they remain ignored by the repository.

**Step 3: Verify configuration**

Run:

```sh
npx expo config --type public
npx expo install --check
```

Expected: the config resolves and dependency versions are compatible.

**Step 4: Commit**

```sh
git add package.json package-lock.json app.json
git commit -m "build: 配置原生 Quick Crypto 开发客户端"
```

### Task 2: Replace the JavaScript scrypt adapter using TDD

**Files:**
- Modify: `src/auth/__tests__/passwordHash.test.ts`
- Modify: `src/auth/passwordHash.ts`

**Step 1: Write failing boundary tests**

Mock only the unavailable native package boundary with a callback-compatible
test double. Cover:

- the fixed persisted vector for password `hunter2secret` and salt
  `ab` repeated 16 times, expecting
  `82a32df0a7b7133ed1ec35f9cecbe1422070cbbf835bfbda77dcc780c605d9d2`;
- native callback errors being rejected;
- an absent derived key being rejected rather than producing an invalid hash.

The success double must independently use Node's `crypto.scrypt` with the same
parameters, not the production helper.

**Step 2: Verify RED**

Run:

```sh
npm test -- --runInBand src/auth/__tests__/passwordHash.test.ts
```

Expected: failure because production still imports `@noble/hashes`.

**Step 3: Implement the minimal adapter**

Use `react-native-quick-crypto`'s `scrypt` and `Buffer`. Wrap the callback in a
Promise with:

```ts
{ N: 2 ** 14, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }
```

Request a 32-byte key and return lowercase hexadecimal. Preserve native errors
and reject a missing key with a clear configuration/runtime error. Do not add a
pure-JavaScript fallback.

**Step 4: Verify GREEN and regressions**

Run:

```sh
npm test -- --runInBand src/auth/__tests__/passwordHash.test.ts
npm test -- --runInBand
npx tsc --noEmit
```

Expected: all commands pass.

**Step 5: Commit**

```sh
git add src/auth/passwordHash.ts src/auth/__tests__/passwordHash.test.ts
git commit -m "perf: 使用原生 scrypt 派生密码"
```

### Task 3: Build and verify the iOS development client

**Files:**
- Update if needed: `.superpowers/sdd/2026-07-27-native-scrypt-development-build/native-verification-report.md`

**Step 1: Generate and build native projects**

Stop the old Expo Go Metro instance, then run:

```sh
npx expo prebuild --clean
npx expo run:ios
npm run start:dev-client
```

Use a separate Metro port if another checkout is still running.

**Step 2: Verify stored-account compatibility**

Open the existing Simulator account without reinstalling or clearing app data.
Confirm its existing password unlocks successfully. Do not print, log, capture,
or write the password into reports.

**Step 3: Verify responsiveness and behavior**

Confirm:

- the spinner/busy label renders in the first frame;
- correct-password submission reaches the five-tab application in at most one
  second on the iOS Simulator;
- wrong passwords restore the form with the existing error;
- duplicate submissions remain blocked;
- Face ID is only requested after an explicit tap and works in the development
  build.

Record measured timings and limitations. Android may be recorded as unavailable
when no emulator/ADB environment exists.

**Step 4: Run final verification**

```sh
npm test -- --runInBand
npx tsc --noEmit
git status --short
```

Expected: tests and type checking pass; only intentional report or generated
ignored files remain.

**Step 5: Commit the report if it contains durable project evidence**

```sh
git add .superpowers/sdd/2026-07-27-native-scrypt-development-build/native-verification-report.md
git commit -m "test: 记录原生 unlock 性能验证"
```
