# Application architecture

This document records the product technology choices and the expected data/UI flow. Keep implementation aligned with this guide; update it when a decision changes.

## Technology roles

| Technology | Role in Mama's Shop |
| --- | --- |
| Expo UI (`@expo/ui`) | Native buttons, switches, pickers, sheets, and other form controls where the SDK 57 component is available for the target platform. Use universal components when one component needs to work on Android, iOS, and web. |
| NativeWind | Layout, spacing, colors, typography, and responsive styling for React Native views. Shared design tokens live in `src/constants/` and global styles in `src/global.css`. |
| Expo Router | Route registry, deep links, auth route group, and primary tab navigation in `src/app/`. Route files delegate to feature-owned screens and logic. |
| Expo SQLite | Durable on-device application data and pending write queue. Screens should remain usable and read from local repositories while offline. |
| Drizzle ORM | Typed local schema and query layer over the SQLite database, owned by `src/db/`. |
| Supabase | Cloud authentication and shared, multi-device data. Database access is protected with tenant-aware Row Level Security policies. Supabase is the remote sync target, not a reason for screens to bypass local repositories. |

Expo UI and NativeWind have different jobs: Expo UI supplies native controls; NativeWind styles the surrounding React Native layout. Keep platform-specific control usage isolated and verify the component's supported platforms against the SDK 57 docs before using it.

Web builds use SQLite's alpha web backend. Metro must treat `.wasm` files as assets, and the hosting server must send `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` so SQLite can use `SharedArrayBuffer`. The Expo Router plugin configures these headers for Expo Hosting; deployments to other hosts must configure the equivalent response headers there.

## Data flow

1. A route in `src/app/` renders a screen from its owning `src/features/<feature>/` module.
2. Feature hooks call repositories in `src/db/repositories/`. Screens read local SQLite data so lists and totals render without waiting for a network request.
3. A user change is saved to SQLite in a transaction. For syncable changes, write the domain record and its outbox operation in the same transaction, then update the UI immediately from local data.
4. `src/services/sync-engine.ts` observes connectivity and queued local writes, appends operations to the Supabase `sync_events` journal, then downloads later events for the active business. A business keeps its owner's auth UUID as its stable `owner_id`; `business_members` links staff auth UUIDs to that owner. Row-level security permits only the owner and accepted members to read and append that business's events.
5. Delete an outbox item only after Supabase confirms the insert. Retry transient failures with bounded backoff; show pending/failed sync state without blocking sales or stock workflows. Each device keeps a pull cursor and an idempotency ledger so replaying its own event does not double-apply it.
6. `src/services/apply-remote-event.ts` owns inbound materialization. Editable product/settings changes use timestamps; sales, repayments, and stock events are immutable and applied once. A stock event that would create negative inventory, a missing dependency, or an unsupported operation is retained as a visible sync conflict rather than silently discarded. Conflicts can be retried from Sync settings after the underlying issue is resolved. Change owed to a customer for later collection is its own `change_owed` entity (schema version 9): it syncs via `change_owed.create`/`change_owed.settle` events, is a shop liability, and never enters the customer credit ledger or the payments table.
7. An owner seller profile is created during first-run setup so each sale has an accountable seller. Seller attribution, locations, and membership data remain supported by the local schema and sync stream for compatibility, while seller/team and multiple-location management screens are deferred from the MVP.
8. Preserve audit history for sales, repayments, expenses, stock movements, customers, sellers, locations, and shop settings. Never silently overwrite financial or inventory events.

Supabase keeps the authenticated session in persistent device storage. If no session can be restored while the device is offline, the app may reopen the most recently active business scope only when that business already has local data. This is local-only access: it never authorizes Supabase requests, and queued changes wait for a valid session before syncing. The login screen offers a direct way back to that saved shop. Email/password authentication and first-time sign-in still require a network connection; the app never stores a password for offline verification. An explicit sign-out clears this local access for the current app run.

Use stable operation IDs and server-side idempotency so a retry cannot create a duplicate sale, repayment, or stock movement. Treat network reachability as a hint: a connected device may still fail to reach Supabase. Never report a queued offline write as server-synced until the server confirms it.

The retained server membership migrations support one-use, expiring business invitations for a future staff-access release. New cloud events record the authenticated uploader in `actor_id`; existing owner events are backfilled to the owner. Apply all `supabase/migrations/` files before enabling cloud sync.

## App updates

EAS Update serves JavaScript and asset changes to installed Android and iOS builds that have `expo-updates` enabled and a matching runtime version. Build profiles use separate `development`, `preview`, and `production` channels. Native code, permissions, and SDK changes still require a new app build.

The app checks for compatible updates on launch and applies downloaded updates on the next launch. After an update is running, `WhatsNewNotice` shows the notes in `src/features/updates/release-notes.ts` once for that update ID. Update that file with concise user-facing notes whenever publishing a user-facing OTA release. Existing installs need one new build with `expo-updates` before they can receive OTA releases.

## Code ownership

- `src/app/`: navigation and thin route entry points.
- `src/features/`: feature screens, forms, validation, and use cases.
- `src/components/`: shared visual components; feature-only components stay inside the feature.
- `src/db/`: SQLite setup, schema, migrations, and repositories. Repositories own local reads/writes and expose typed feature-facing methods.
- `src/services/`: Supabase adapters, sync orchestration, and conflict policy.
- `src/lib/`: low-level shared helpers (network, formatting, permission checks, and the Supabase client).
- `src/stores/`: transient app-wide client state only. Persisted business records belong in SQLite.
- `supabase/migrations/`, `supabase/functions/`, `supabase/seed.sql`: remote schema, server functions, and development seed data.
- `tests/`: Jest suites for repositories, migrations, inbound event materialization, and the sync engine. `tests/helpers/sqlite.ts` runs the real SQLite business SQL against an in-memory `node:sqlite` database through an expo-sqlite-compatible adapter.

## MVP scope

The first release focuses on sales, inventory, and customer credit. Expense entry, detailed reports, staff invitations, and multi-location management are deferred from the app UI. Existing migrations, audit records, and sync handlers remain so prior business data is preserved and can still be synchronized.

## Product design

The approved UI/UX references in [`design/README.md`](./design/README.md) are the visual source of truth for screen hierarchy, spacing, colors, typography, component states, and interaction behavior. Implement designs mobile-first and keep behavior usable across supported platforms.

## Documentation

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [Expo UI](https://docs.expo.dev/versions/v57.0.0/sdk/ui/)
- [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [NativeWind installation](https://www.nativewind.dev/docs/getting-started/installation)
- [Supabase with Expo and React Native](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)
