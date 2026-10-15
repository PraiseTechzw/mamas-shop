# Mama's Shop

An Expo and React Native app for managing shop sales, stock, credit, expenses, and reporting.

## Getting started

Install dependencies with `npm install`, then start Expo with `npx expo start`.

Copy `.env.example` to `.env` and fill in the public Supabase configuration when cloud data access is enabled. Never commit secrets.

## Project organization

- `src/app/` contains Expo Router screens and layouts only. Route groups organize auth and tabs; feature URLs are grouped by sales, inventory, credit, expenses, reports, and settings.
- `src/features/` owns business behavior and feature-specific UI. Keep route files thin and delegate screens to their owning feature as workflows are built.
- `src/components/` contains reusable UI shared across features.
- `src/db/`, `src/lib/`, `src/services/`, and `src/stores/` contain persistence, shared utilities, integrations/synchronization, and app-wide state.
- `supabase/` contains backend migrations, functions, and seed data.

The current route screens are scaffolds. Implement business workflows inside their owning `src/features/<feature>/` module rather than growing the route files.

See [AGENTS.md](./AGENTS.md) for the required architecture and contribution rules used by developers and coding agents. [docs/architecture.md](./docs/architecture.md) describes how the UI, local database, and cloud sync fit together. [docs/design/README.md](./docs/design/README.md) records the approved UI/UX reference location.
