-- Notify connected shop members as soon as another device records a sync event.
-- The client still pulls and applies events through the existing idempotent sync flow.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'sync_events'
     ) then
    execute 'alter publication supabase_realtime add table public.sync_events';
  end if;
end;
$$;
