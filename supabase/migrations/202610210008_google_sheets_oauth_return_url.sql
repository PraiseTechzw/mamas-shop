-- Keep the app's one-time OAuth return address with its matching state.
-- Expo Go uses a temporary exp:// URL; installed builds use mamasshop://.
alter table public.google_sheets_oauth_states
  add column if not exists return_url text;
