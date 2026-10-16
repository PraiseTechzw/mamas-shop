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

## Data flow

1. A route in `src/app/` renders a screen from its owning `src/features/<feature>/` module.
2. Feature hooks call repositories in `src/db/repositories/`. Screens read local SQLite data so lists and totals render without waiting for a network request.
3. A user change is saved to SQLite in a transaction. For syncable changes, write the domain record and its outbox operation in the same transaction, then update the UI immediately from local data.
4. `src/services/sync-engine.ts` observes connectivity and queued local writes, appends operations to the Supabase `sync_events` journal, then downloads later events for the active business. A business keeps its owner's auth UUID as its stable `owner_id`; `business_members` links staff auth UUIDs to that owner. Row-level security permits only the owner and accepted members to read and append that business's events.
5. Delete an outbox item only after Supabase confirms the insert. Retry transient failures with bounded backoff; show pending/failed sync state without blocking sales or stock workflows. Each device keeps a pull cursor and an idempotency ledger so replaying its own event does not double-apply it.
6. `src/services/apply-remote-event.ts` owns inbound materialization. Editable product/settings changes use timestamps; sales, repayments, and stock events are immutable and applied once. A stock event that would create negative inventory, a missing dependency, or an unsupported operation is retained as a visible sync conflict rather than silently discarded. Conflicts can be retried from Sync settings after the underlying issue is resolved.
7. Seller profiles identify who is responsible for each sale and support per-seller reports. Owner-created seller profiles are shop-owned; an accepted staff account uses its auth UUID as its seller ID. Locations and sellers sync as part of the business event stream. Joining downloads the existing event archive. Accounts with existing local business records cannot join, which prevents local records and queued events from being reassigned silently.
8. Preserve audit history for sales, repayments, expenses, stock movements, customers, sellers, locations, and shop settings. Never silently overwrite financial or inventory events.

Use stable operation IDs and server-side idempotency so a retry cannot create a duplicate sale, repayment, or stock movement. Treat network reachability as a hint: a connected device may still fail to reach Supabase. Never report a queued offline write as server-synced until the server confirms it.

Business invitations store only a SHA-256 code hash in Supabase. Codes are one-use, expire after 14 days, and can optionally be restricted to the invited email. The membership RPC enforces one business per staff login. New cloud events record the authenticated uploader in `actor_id`; existing owner events are backfilled to the owner. Apply all `supabase/migrations/` files before enabling cloud sync or staff invitations.

## Code ownership

- `src/app/`: navigation and thin route entry points.
- `src/features/`: feature screens, forms, validation, and use cases.
- `src/components/`: shared visual components; feature-only components stay inside the feature.
- `src/db/`: SQLite setup, schema, migrations, and repositories. Repositories own local reads/writes and expose typed feature-facing methods.
- `src/services/`: Supabase adapters, sync orchestration, conflict policy, and cross-feature reporting.
- `src/lib/`: low-level shared helpers (network, formatting, permission checks, and the Supabase client).
- `src/stores/`: transient app-wide client state only. Persisted business records belong in SQLite.
- `supabase/migrations/`, `supabase/functions/`, `supabase/seed.sql`: remote schema, server functions, and development seed data.

## Product design

The approved UI/UX references in [`design/README.md`](./design/README.md) are the visual source of truth for screen hierarchy, spacing, colors, typography, component states, and interaction behavior. Implement designs mobile-first and keep behavior usable across supported platforms.

## Documentation

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [Expo UI](https://docs.expo.dev/versions/v57.0.0/sdk/ui/)
- [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [NativeWind installation](https://www.nativewind.dev/docs/getting-started/installation)
- [Supabase with Expo and React Native](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)
