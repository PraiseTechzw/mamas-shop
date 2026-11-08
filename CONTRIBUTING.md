# Contributing

Thanks for helping improve Mama's Shop. Changes should preserve the app's offline-first behavior, business audit history, and supported Android, iOS, and web workflows.

## Set up

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and configure a development Supabase project. Never commit `.env` or server credentials.
3. Start the app with `npm run start`.

See the [README](README.md) for product scope and the [documentation index](docs/README.md) for architecture, design, and service setup.

## Before opening a pull request

Run the checks used by CI:

```sh
npm run lint
npx tsc --noEmit
npm test -- --runInBand
```

For Expo dependency or native configuration changes, also run `npx expo-doctor`. Native changes need a development or store build to verify; a passing web build alone is not sufficient.

## Change guidelines

- Keep route files in `src/app/` thin; put feature behavior in its owning `src/features/` module.
- Read and write business data through SQLite repositories. Keep local writes responsive and synchronize them through the sync service.
- Add forward-only Supabase migrations for schema changes. Preserve audit history and make sync operations idempotent; never silently overwrite financial or inventory events.
- Add or update focused tests for changed business rules, repositories, migrations, and synchronization behavior.
- Follow the approved references in [Product design](docs/design/README.md). Do not use route scaffolds as final screen designs.
- Update the relevant docs when setup, behavior, architecture, or release procedures change.
- Keep screenshots and recordings free of real customer data, credentials, and personal account details.

## Pull requests

Use the pull request template. Explain the user-visible change, note any migration or configuration impact, list the checks you ran, and include before/after screenshots for visual changes when available. Do not include secrets or production customer data in screenshots, logs, or test fixtures.
