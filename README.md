# Mama's Shop

An Expo and React Native app for managing shop sales, stock, credit, expenses, and reporting.

## Getting started

Install dependencies with `npm install`, then start Expo with `npx expo start`.

Copy `.env.example` to `.env` and fill in the public Supabase configuration. Apply the database migrations with `npx supabase db push` after linking the project. In Supabase Authentication → URL Configuration, add `mamasshop://reset-password` to the allowed redirect URLs so password recovery can return to the app. Never commit secrets.

## Project organization

- `src/app/` contains Expo Router screens and layouts only. Route groups organize auth and tabs; feature URLs are grouped by sales, inventory, credit, expenses, reports, and settings.
- `src/features/` owns implemented business workflows and feature-specific UI. Keep route files thin and delegate screens to their owning feature.
- `src/components/` contains reusable UI shared across features.
- `src/db/`, `src/lib/`, `src/services/`, and `src/stores/` contain persistence, shared utilities, integrations/synchronization, and app-wide state.
- `supabase/` contains backend migrations, functions, and seed data.

Business workflows are implemented in their owning `src/features/<feature>/` modules. Shop owners can invite staff from Settings → Team. Each staff member signs in with their own account and redeems a one-use code that expires after 14 days. The migration `202610150003_business_membership_invites.sql` adds membership records and the matching sync-event authorization policies; apply it with the other Supabase migrations before using invitations. Staff accounts with existing local shop records must sync or use a fresh account before joining so their data is not stranded.

See [AGENTS.md](./AGENTS.md) for the required architecture and contribution rules used by developers and coding agents. [docs/architecture.md](./docs/architecture.md) describes how the UI, local database, and cloud sync fit together. [docs/design/README.md](./docs/design/README.md) records the approved UI/UX reference location.
