# Final fix report: onboarding/auth final review

## Scope and root causes

Implementation commit: `206472a` (`fix: 加固生物识别解锁与原生配置`).

The final review wave stayed within the requested onboarding/auth scope:

- `app/unlock.tsx` previously discarded the automatic biometric promise while
  hardware, enrollment, and native authentication calls were outside a
  complete error boundary. The screen also had no foreground ownership or
  shared in-flight state, so native rejection could escape, a late account
  read could prompt in the background, and multiple triggers could start
  overlapping prompts.
- The biometric prompt accepted Expo's default device fallback and Android's
  default weak biometric class.
- `expo-secure-store` was installed but absent from the production config
  plugin list, so Continuous Native Generation did not explicitly produce
  SecureStore-aware Android backup rules.
- The root layout did not render `expo-status-bar`, so status-bar appearance
  was not derived from the app theme.
- `docs/design-reference/src/main.tsx` contained leading/trailing blank space,
  trailing whitespace, and no final newline.

## Changes

- Foreground-gated biometric work from initial `AppState.currentState` and
  subsequent app-state transitions. Foreground is fail-closed when the
  initial state is not explicitly `active`.
- Serialized automatic and manual biometric triggers through one shared
  promise. The full native flow is contained in `try/catch/finally`; rejection
  stays locked and always clears the busy state without an unhandled promise.
- Disabled and marked the manual biometric action busy while a native flow is
  active, with visible `Authenticating…` feedback.
- Passed `disableDeviceFallback: true` and
  `biometricsSecurityLevel: 'strong'` to `authenticateAsync`.
- Preserved password unlock and AuthGate's existing background relock/late
  unlock rejection semantics.
- Added behavior-focused coverage for strong prompt policy, native rejection,
  a background transition before automatic authentication, initial
  background mount, and a double trigger ending in rejection.
- Added a theme-driven Expo status bar (`light` content in dark mode, `dark`
  content in light mode) with a layout-level test.
- Added the production `expo-secure-store` plugin with
  `configureAndroidBackup: true`.
- Normalized whitespace and EOF in `docs/design-reference/src/main.tsx`.

## RED-GREEN evidence

The focused RED run failed for the intended behavior gaps:

- biometric options lacked `disableDeviceFallback` and strong security;
- a rejected native prompt escaped the automatic `void` call;
- automatic authentication still started after backgrounding;
- the biometric action had no serialized busy/disabled behavior;
- the root layout rendered no themed Expo status bar.

A separate initial-background RED test then showed that a permissive
foreground default still started the prompt when mounted in `background`.
After the fail-closed initialization change, the focused command passed:

`npm test -- --runInBand src/auth/__tests__/screens.test.tsx
src/theme/__tests__/RootLayoutStatusBar.test.tsx`

- 2 suites passed
- 20 tests passed
- 0 failed

## Verification

- `npm test -- --runInBand`
  - exit 0
  - 8 suites passed
  - 56 tests passed
  - 0 failed
- `npx tsc --noEmit`
  - exit 0
  - no diagnostics
- `npx expo export --platform ios --output-dir
  /private/tmp/cloudflareops-final-fix-019fa15f`
  - exit 0
  - iOS Hermes bundle and metadata exported
- `npm ls --depth=0`
  - exit 0
  - dependency tree reported without missing/invalid packages
- `npx expo config --type introspect --json`
  - plugin entry:
    `["expo-secure-store", {"configureAndroidBackup": true}]`
  - generated Android application attributes:
    - `android:fullBackupContent="@xml/secure_store_backup_rules"`
    - `android:dataExtractionRules="@xml/secure_store_data_extraction_rules"`
  - installed Expo SecureStore resources exclude shared preferences at path
    `SecureStore` from Android 11-and-lower backup, Android 12+ cloud backup,
    and Android 12+ device transfer.
- `git diff --check 8b5b8ea..HEAD`
  - exit 0 with no output at implementation HEAD `206472a`

## Files changed

- `app/unlock.tsx`
- `app/_layout.tsx`
- `app.json`
- `src/auth/__tests__/screens.test.tsx`
- `src/theme/__tests__/RootLayoutStatusBar.test.tsx`
- `docs/design-reference/src/main.tsx`
- `.superpowers/sdd/2026-07-26-figma-onboarding-auth/final-fix-report.md`

## Deferred and concerns

- Final-review Minor #1 (native branding/assets) is intentionally deferred.
  Replacing product icons, adaptive icons, splash art, and related native
  branding needs a dedicated approved branding-asset pass; this wave did not
  alter those assets.
- No implementation concern remains from this fix scope. The iOS export
  emitted only the existing benign `NO_COLOR`/`FORCE_COLOR` environment
  warnings.
