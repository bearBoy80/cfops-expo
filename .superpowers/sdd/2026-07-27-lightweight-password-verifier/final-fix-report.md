# Final fix report — lightweight password verifier

Base: `6aa5f2c`

## Finding mapping

| Finding | Resolution | Evidence |
| --- | --- | --- |
| Important: remove the v2 onboarding fallback | Deleted the fallback in `parseAccount`. An otherwise-valid `local-account-v2` record that omits organization, email, onboardingComplete, and onboardingStep now throws `LocalAccountStorageError('corrupt')`. No migration was added. | Replaced the legacy-acceptance test with `rejects an otherwise-valid v2 account without onboarding fields as corrupt`. |
| Minor: README and obsolete Jest allowlist | Changed the README from scrypt to the salted v2 SHA-256 verifier and removed `@noble` from `transformIgnorePatterns`. | Full Jest and TypeScript verification below. |
| Minor: inert View typography | Removed `fontSize` from `AuthTextInput`'s container View; the TextInput retains its typography. | Full Jest and TypeScript verification below. |
| Minor: biometric-first cross-mode exclusion | Added a pending `authenticateAsync` test that presses Unlock, flushes the password scheduling boundary, and proves zero SecureStore reads while the password action remains disabled. | Focused test and controlled mutation RED below. |
| Minor: RAF ordering proof | Reworked the password-busy test to hold the RAF callback, flush microtasks, assert `Unlocking…`, disabled controls, duplicate-press exclusion, and zero SecureStore reads before releasing the frame. | Focused test and controlled mutation RED below. |

## RED evidence

### Missing onboarding fields

Command:

```sh
npx jest src/auth/__tests__/localAccount.test.ts --runInBand -t 'without onboarding fields'
```

Result: exit 1, 1 failed. The promise resolved to the synthesized legacy account instead of rejecting with the typed corrupt error.

### RAF ordering

After adding the controlled-RAF test, the existing RAF boundary was temporarily mutated to `Promise.resolve()` solely to demonstrate the regression.

Command:

```sh
npx jest src/auth/__tests__/screens.test.tsx --runInBand -t 'renders the busy password UI before reading SecureStore'
```

Result: exit 1, 1 failed. `SecureStore.getItemAsync` had one call before the held frame was released. Restoring the RAF boundary made the test pass.

### Biometric-first exclusion

After adding the pending-biometric test, the password cross-mode guard and password control disabling were temporarily mutated solely to demonstrate the regression.

Command:

```sh
npx jest src/auth/__tests__/screens.test.tsx --runInBand -t 'does not start password verification while biometric authentication is pending'
```

Result: exit 1, 1 failed. Pressing Unlock caused one `local-account-v2` SecureStore read while `authenticateAsync` remained pending. Restoring the existing ref guard and `authBusy` disabling made the test pass.

The temporary mutations are not present in the final diff.

## GREEN and verification evidence

Focused:

```sh
npx jest src/auth/__tests__/localAccount.test.ts src/auth/__tests__/screens.test.tsx --runInBand
```

Result: exit 0; 2 suites passed, 62 tests passed.

Full suite:

```sh
npx jest --runInBand
```

Result: exit 0; 10 suites passed, 91 tests passed.

TypeScript:

```sh
npx tsc --noEmit
```

Result: exit 0. An initial run identified the test fixture's Node-only `global` reference; replacing it with `globalThis` resolved the typing issue.

Diff hygiene:

```sh
git diff --check
```

Result: exit 0.

## Self-review

- All five findings map to final diff changes; no migration or unrelated behavior was added.
- The v2 parser now follows one validation path for onboarding fields.
- The RAF test observes the pre-verification UI state after a microtask flush, so the zero-read assertion cannot pass merely because the promise callback has not run yet.
- The biometric-first test holds native authentication pending and makes a password attempt with an immediate RAF fixture, so a missing cross-mode exclusion is observable as a SecureStore read.
- The original duplicate-password submission assertion remains covered by pressing the disabled busy action before RAF release.

## Concerns

None.
