# Mama's Shop

An Expo and React Native app focused on shop sales, stock, and customer credit.

## Getting started

Install dependencies with `npm install`, then start Expo with `npx expo start`.

Copy `.env.example` to `.env` and fill in the public Supabase configuration. Apply the database migrations with `npx supabase db push` after linking the project. In Supabase Authentication → URL Configuration, add `mamasshop://reset-password` to the allowed redirect URLs so password recovery can return to the app. Never commit secrets.

## Project organization

- `src/app/` contains Expo Router screens and layouts only. Route groups organize auth and tabs; supporting routes handle sales checkout and history, stock actions, customer accounts, setup, and shop settings.
- `src/features/` owns implemented business workflows and feature-specific UI. Keep route files thin and delegate screens to their owning feature.
- `src/components/` contains reusable UI shared across features.
- `src/db/`, `src/lib/`, `src/services/`, and `src/stores/` contain persistence, shared utilities, integrations/synchronization, and app-wide state.
- `supabase/` contains backend migrations, functions, and seed data.

The first release focuses on recording sales, keeping inventory accurate, and tracking customer credit. Sales, stock, and credit records save to the device first and sync when a connection is available. Staff invitations, expense tracking, detailed reports, and multi-location management are deferred from the MVP; their existing database and sync records are retained for compatibility.

## First-run setup and money rules

A new shop owner is taken through a first-run setup screen (`/setup`) that captures the shop name and currency, then creates the primary stock location and the owner seller profile so new sales can be recorded straight away.

All money is stored as integer minor units (cents). A sale records what was tendered, what was paid, and any balance separately: overpayment never becomes customer credit, and an unpaid or partially paid balance requires a customer and writes a reconciling ledger entry. Change the customer will collect later is stored in its own `change_owed` records (a shop liability shown and settled independently on the customer account) so it never corrupts the customer's credit balance. Recorded payment methods (cash, EcoCash, card, other) capture how the shop was paid; the app does not process live payments.

## Testing

Automated coverage for the repository and sync layers runs with Jest against an in-memory SQLite database (a `node:sqlite` adapter mirrors the `expo-sqlite` API). Use `npx jest`. Before releasing, also run `npx tsc --noEmit`, `npx expo lint`, and `npx expo-doctor`.

See [AGENTS.md](./AGENTS.md) for the required architecture and contribution rules used by developers and coding agents. [docs/architecture.md](./docs/architecture.md) describes how the UI, local database, and cloud sync fit together. [docs/design/README.md](./docs/design/README.md) records the approved UI/UX reference location.
