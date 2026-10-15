This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Project structure and feature ownership

- Organize product code by business feature under `src/features/<feature>/`. Keep a feature's components, hooks, schemas, and domain logic together; share code only when it is genuinely used by multiple features.
- `src/app/` is the Expo Router route registry. Route files should stay thin: render a screen owned by `src/features/` or shared UI from `src/components/`. Keep data access and business logic out of route files.
- Route groups `(auth)` and `(tabs)` organize navigation without changing URLs. Feature routes such as sales, inventory, credit, expenses, reports, and settings live in their matching route folders under `src/app/`.
- Shared presentational components belong in `src/components/` (ui, charts, forms, feedback, layout). Cross-cutting hooks, constants, types, and utilities belong in `src/hooks/`, `src/constants/`, `src/types/`, and `src/lib/`.
- Database schema/client/repositories belong in `src/db/`; external service adapters and background synchronization belong in `src/services/`; app-wide client state belongs in `src/stores/`.
- Supabase migrations and Edge Functions belong in `supabase/migrations/` and `supabase/functions/`. Keep secrets out of source control; document required public configuration in `.env.example`.
- Do not add placeholder business behavior or duplicate feature logic to make a folder appear complete. Add a route only when it represents a screen, and keep business behavior in its owning feature.
- Before changing architecture, inspect this guide and the neighboring feature patterns. Keep this file current so all coding agents and AI tools follow the same structure.

## Product technology and design requirements

- Follow [`docs/architecture.md`](docs/architecture.md) for the roles of Expo UI, NativeWind, Expo Router, Expo SQLite, and Supabase, plus the offline write and synchronization flow.
- The approved UI/UX reference is the product source of truth. Check [`docs/design/README.md`](docs/design/README.md) for the design link before implementing screens; do not treat route scaffolds as approved UI.
- Use Expo UI for suitable native controls and NativeWind for React Native layout/styling. Check SDK 57 platform support for Expo UI components and preserve cross-platform behavior.
- Read and write business data through SQLite repositories. Keep local writes responsive offline and sync through the sync service; feature screens must not directly call Supabase for ordinary business data reads/writes.
- Sync operations must be idempotent, preserve audit history, and use an explicit per-entity conflict policy. Never silently overwrite financial or inventory events.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
