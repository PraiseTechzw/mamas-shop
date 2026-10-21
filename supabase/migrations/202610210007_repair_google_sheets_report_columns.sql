-- Earlier versions of the report tables may already exist without the fields
-- introduced by the current OAuth and incremental sync handlers. CREATE TABLE
-- IF NOT EXISTS does not add those fields to an existing table.
alter table public.google_sheets_oauth_states
  add column if not exists shop_name text not null default 'Mama''s Shop';

alter table public.google_sheets_connections
  add column if not exists cursor_received_at timestamptz,
  add column if not exists cursor_key uuid;
