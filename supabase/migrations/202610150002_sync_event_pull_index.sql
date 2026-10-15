-- Stable, tenant-scoped ordering for incremental event downloads.
create index if not exists sync_events_owner_received_key_idx
  on public.sync_events (owner_id, received_at asc, idempotency_key asc);
