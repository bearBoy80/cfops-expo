# Repository Guidelines

## Project Structure & Module Organization

This repository is currently design- and specification-led. `docs/superpowers/specs/` contains the approved architecture, while `docs/superpowers/plans/` contains staged implementation plans. Treat both as source-of-truth documents before changing application behavior.

`Cloudflare Client App Design/` is the runnable Vite/React reference exported from Figma. Its entry point is `src/main.tsx`; screens and shared UI live in `src/app/`, styles in `src/styles/`, and imported design assets in `src/imports/`. The planned production Expo app (`app/`, `src/`, and colocated `__tests__/`) has not yet been scaffolded.

## Build, Test, and Development Commands

Run prototype commands from the directory with spaces quoted:

```sh
cd "Cloudflare Client App Design"
npm install
npm run dev
npm run build
```

`npm run dev` starts Vite locally; `npm run build` produces a production bundle and is the current minimum verification step. No test or lint script is defined yet. When the Expo scaffold lands, follow the implementation plan and run `npx tsc --noEmit`, `npx jest`, `npm run ios`, and `npm run android`.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation. Name React components and contexts in PascalCase, hooks with a `use` prefix, and ordinary modules in camelCase (for example, `localAccount.ts`). Keep reusable UI in `src/components/ui/` and route files in Expo Router’s filesystem structure. Prefer the `@/` alias for prototype imports. The production app must keep colors in `src/theme/tokens.ts`; do not scatter hex values through components. UI copy is authored in English as the source language and translated through i18n resources in `src/i18n/locales/` (`en.json`, `zh-Hans.json`); components must render text via `t()` keys instead of hard-coded strings.

## Testing Guidelines

Add tests as `*.test.ts` or `*.test.tsx` in a nearby `__tests__/` directory. Planned tooling is Jest via `jest-expo` with React Native Testing Library. Cover authentication state changes, storage behavior, and account-scoped data logic. UI changes require manual checks on both iOS and Android. Until test infrastructure exists, document manual verification and ensure the Vite build succeeds.

## Commit & Pull Request Guidelines

History follows Conventional Commits, often with concise Chinese descriptions: `feat: ...`, `docs: ...`, and `chore: ...`. Keep each commit focused. Pull requests should summarize scope, link the relevant spec or issue, list commands and devices tested, and include before/after screenshots for visual changes.

## Security & Configuration

Never commit API tokens, OAuth secrets, or local credentials. Production secrets belong in `expo-secure-store`, not AsyncStorage, SQLite, fixtures, or logs. Do not commit generated output, `node_modules/`, or `.worktrees/`.
