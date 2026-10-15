-- Immutable cloud copy for offline-first client changes.
-- The mobile client can append its own events but cannot edit or remove history.
create table if not exists public.sync_events (
  idempotency_key uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (length(entity_type) between 1 and 80),
  entity_id text not null check (length(entity_id) between 1 and 160),
  operation text not null check (length(operation) between 1 and 100),
  payload jsonb not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists sync_events_owner_received_idx
  on public.sync_events (owner_id, received_at desc);

alter table public.sync_events enable row level security;
alter table public.sync_events force row level security;

drop policy if exists "Users can append their own sync events" on public.sync_events;
create policy "Users can append their own sync events"
  on public.sync_events for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Users can read their own sync events" on public.sync_events;
create policy "Users can read their own sync events"
  on public.sync_events for select to authenticated
  using (auth.uid() = owner_id);

revoke all on public.sync_events from anon, authenticated;
grant insert, select on public.sync_events to authenticated;
