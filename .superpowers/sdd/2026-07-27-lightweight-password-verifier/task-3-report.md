# Task 3 — Expo Go native verification

Date: 2026-07-27

Tested commit: `03ce3d9`

Result: PASS with environment limitations noted below

## Environment

- iPhone 11 Pro Max Simulator, iOS 26.1
- Expo Go with Expo SDK 57
- Metro on an isolated localhost port; the main checkout's port 8081 was not
  touched
- Existing Simulator storage was retained throughout the verification

The first LAN launch URL failed in Expo Go with `The network connection was
lost.` Restarting Metro in localhost mode resolved the connection without
clearing SecureStore or rebuilding a development client.

## Native flow results

| Check | Result | Evidence |
| --- | --- | --- |
| Existing unpublished v1 data is ignored | PASS | Without clearing Simulator storage, the v2 build opened the fresh `Cloudflare Console` welcome screen rather than an old account's Unlock screen. |
| Fresh v2 onboarding | PASS | Completed Welcome, local account creation, skipped Cloudflare connection, reached `You're all set`, then entered the five-tab app. |
| Relaunch starts locked | PASS | Backgrounded Expo Go to the Simulator home screen and reopened it; the first app screen was `Welcome back, Test User` with the password Unlock form. |
| Five-tab destination | PASS | Successful unlock showed Home, Zones, Storage, Compute, and More. |
| Incorrect password | PASS | An incorrect value stayed on Unlock and displayed `Incorrect password.`; editing the field cleared the error. |
| Biometrics are manual-only | PASS within Simulator limits | No biometric prompt appeared on mount. The biometric control was present only as an explicit action. A manual tap returned to the password form without a native prompt, consistent with unavailable hardware/enrollment behavior in this Expo Go Simulator session. |

## Unlock timing

The timing boundary was the accepted Unlock submission to the first render of
the Tabs layout. Three `performance.now()` samples were collected with a
temporary, input-free local diagnostic marker:

- 24.3 ms
- 20.3 ms
- 16.6 ms

Average: 20.4 ms. Maximum: 24.3 ms. All samples are below the 250 ms target.
The diagnostic marker logged only elapsed milliseconds, was removed after
sampling, and is not part of the committed application code.

## Busy feedback and duplicate blocking

The native transition completed in 16.6–24.3 ms, while the Computer Use action
and accessibility capture path adds roughly half a second or more. It therefore
could not capture the transient `Unlocking…` frame reliably without changing
the production timing.

The complete Jest suite deterministically verified the same interaction
contract: the busy Unlock button is disabled, the password field is disabled,
the biometric action is mutually exclusive, a duplicate press causes only one
SecureStore read, and the pending attempt unlocks only once. The production
path also yields through `requestAnimationFrame` before password verification,
which lets the busy state render first.

## Automated verification

```text
npm test -- --runInBand
Test Suites: 10 passed, 10 total
Tests:       76 passed, 76 total
Exit code: 0

npx tsc --noEmit
Exit code: 0
Diagnostics: none
```

## Concerns

- Expo Go on this Simulator did not present a native Face ID dialog after the
  explicit biometric tap, so successful/cancelled Face ID outcomes remain a
  manual-device check.
- First-frame busy feedback was verified deterministically by Jest and code
  sequencing, but the native frame itself was too short for the Computer Use
  accessibility capture latency.
