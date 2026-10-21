-- Google Sheets connection tokens and cursors are server-only. No client role
-- receives access; the Edge Functions use the service role after JWT checks.
create table if not exists public.google_sheets_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  connected_email text not null,
  spreadsheet_id text not null,
  spreadsheet_url text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  syncing_until timestamptz,
  cursor_received_at timestamptz,
  cursor_key uuid,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_sheets_oauth_states (
  state text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shop_name text not null default 'Mama''s Shop',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.google_sheets_connections enable row level security;
alter table public.google_sheets_connections force row level security;
alter table public.google_sheets_oauth_states enable row level security;
alter table public.google_sheets_oauth_states force row level security;
revoke all on public.google_sheets_connections, public.google_sheets_oauth_states from public, anon, authenticated;
