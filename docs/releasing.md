# Build and Release

## Before a release

1. Confirm the intended app version in `app.json`; the runtime version follows the app version.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the matching EAS environment. These are public client values. Keep service-role keys and OAuth secrets in their server-side secret stores.
3. Apply all required Supabase migrations and deploy the Edge Functions used by the release. For Google Sheets, follow [Google Sheets reports](google-sheets-reports.md).
4. Run `npm run lint`, `npx tsc --noEmit`, `npm test -- --runInBand`, and `npx expo-doctor`.
5. Build and verify a preview on the target platforms before production submission. Test authentication, deep links, offline writes, and synchronization with non-production data.

## EAS build profiles

The profiles in `eas.json` use the `development`, `preview`, and `production` EAS environments. Configure each environment in the EAS project before building.

```sh
npx eas-cli@latest build --profile development
npx eas-cli@latest build --profile preview
npx eas-cli@latest build --profile production
```

The development profile creates an internal development-client build. Preview builds are for internal distribution. Production builds enable the configured version auto-increment and are intended for store release. Complete platform signing and store setup in EAS before requesting production builds.

## Over-the-air updates

Use EAS Update only for JavaScript and asset changes compatible with the installed native runtime. Native code, permissions, Expo SDK, or native dependency changes require a new build. Publish to the matching channel and update `src/features/updates/release-notes.ts` with user-facing notes. See [Architecture: App updates](architecture.md#app-updates) for the in-app notice behavior.

Do not submit a store release or publish an OTA update from an unverified local change. Follow the Expo and EAS documentation for the current SDK and project configuration.
