# Mama's Shop

An offline-first shop management app for recording sales, tracking stock, and managing customer credit. Built with Expo, React Native, SQLite, and Supabase.

[![CI](https://github.com/PraiseTechzw/mamas-shop/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PraiseTechzw/mamas-shop/actions/workflows/ci.yml)
![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo)
![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS-4c8c6b)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f57.svg)](./LICENSE)

## Product scope

- Record sales and payments, including customer balances and change owed.
- Manage products, stock receipts, adjustments, and inventory history.
- Track customer credit and repayments.
- Keep business data available locally and synchronize queued changes when connectivity returns.
- Sign in with Supabase and use the app on Android, iOS, and supported web environments.

The first release focuses on sales, inventory, and customer credit. Expenses, detailed reports, staff invitations, and multi-location management are not part of the current app workflow; retained database and sync support does not mean those screens are shipped.

Money is stored as integer minor units. Recorded payment methods describe how the shop was paid; the app does not process live payments.

## Design references

The repository includes approved UI design showcases, not screenshots captured from a running release build. See [the design reference guide](docs/design/README.md) before changing screens. Current live-app screenshots and demo recordings are not included yet.

## Quick start

### Requirements

- Node.js and npm
- A Supabase project for sign-in and cloud synchronization
- Expo Go for basic development, or an EAS development build for native modules and production deep-link testing

### Install and configure

```sh
npm ci
cp .env.example .env
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env`. The legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback. These are public client values; never put service-role keys, OAuth client secrets, or other server credentials in `EXPO_PUBLIC_` variables.

Apply the repository's Supabase migrations to the intended project. For a linked project, use `npx supabase link` followed by `npx supabase db push`. In Supabase Authentication URL Configuration, allow `mamasshop://reset-password` for password recovery. Google Sheets configuration is optional and documented separately.

### Run

```sh
npm run start
```

Use the Expo CLI prompts to open the app on a device, emulator, or web. Native modules and production OAuth/deep-link flows require a development or store build; Expo Go does not include every native module.

## Quality checks

Run the same checks used by GitHub Actions before opening a pull request:

```sh
npm run lint
npx tsc --noEmit
npm test -- --runInBand
```

The Jest suites exercise repositories and synchronization against an in-memory SQLite adapter. `npx expo-doctor` is also recommended before a release build.

## Repository map

| Path              | Contents                                                  |
| ----------------- | --------------------------------------------------------- |
| `src/app/`        | Expo Router routes and layouts                            |
| `src/features/`   | Feature-owned screens and business workflows              |
| `src/components/` | Shared presentation components                            |
| `src/db/`         | SQLite schema, migrations, and repositories               |
| `src/services/`   | Cloud synchronization and service integrations            |
| `supabase/`       | Remote migrations, Edge Functions, and seed data          |
| `tests/`          | Jest tests for data, business rules, and sync             |
| `docs/`           | Architecture, product design, setup, and release guidance |

See [the documentation index](docs/README.md) for project guides and [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

## License

This project is distributed under the [MIT License](LICENSE). Third-party packages and assets may have separate terms; consult their respective license notices.
