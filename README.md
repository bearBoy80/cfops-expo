# Opsflare

Cloudflare multi-account mobile client built with Expo and React Native for
iOS and Android. The current foundation milestone provides a themed five-tab
shell, a local app account, password unlock, and optional biometric unlock.

## Development

Install dependencies and start Metro:

```sh
npm install
npm start
```

From the Expo prompt, press `i` for the iOS Simulator or `a` for an Android
emulator. The platform-specific shortcuts are also available as
`npm run ios` and `npm run android`.

Run the project checks before committing:

```sh
npm test -- --runInBand
npx tsc --noEmit
```

Tests use Jest, `jest-expo`, and React Native Testing Library. Place tests in a
nearby `__tests__/` directory and name them `*.test.ts` or `*.test.tsx`.

## Architecture

- `app/` contains Expo Router layouts and screens.
- `src/auth/` owns the local account and authentication state machine.
- `src/components/` contains shared UI and authentication controls.
- `src/theme/` is the only source for application color tokens.
- `oauth-relay/` is the Cloudflare Worker that bounces the OAuth callback back
  into the app scheme; see `oauth-relay/README.md`.
- `docs/design-reference/` contains the Figma Make reference export.

First launch follows the four-step Figma onboarding flow. After setup,
every cold start and foreground return requires password or biometric unlock
before the five-tab shell mounts.

Local passwords use a salted v2 SHA-256 verifier stored through `expo-secure-store`.
Never place passwords, Cloudflare credentials, or API tokens in source,
AsyncStorage, SQLite, fixtures, or logs.

The official `cloudflare` package is retained for types only: its current
exports do not bundle through Metro/Hermes, so API calls will use the typed
fetch adapter described in the specification.

## Documentation

- Spec: `docs/superpowers/specs/2026-07-25-cloudflare-client-p1-design.md`
- Plans: `docs/superpowers/plans/`
- Contributor guide: `AGENTS.md`
