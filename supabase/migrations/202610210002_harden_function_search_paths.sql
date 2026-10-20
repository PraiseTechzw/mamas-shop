-- Reapply the safe function search path for databases where the original
-- membership migrations have already run. All function bodies schema-qualify
-- non-system objects, so an empty path prevents caller-controlled shadowing.
alter function public.my_business_id() set search_path = '';
alter function public.create_business_invite(text, text, text) set search_path = '';
alter function public.join_business_with_code(text) set search_path = '';
alter function public.set_business_joinable(boolean, text) set search_path = '';
alter function public.get_my_business_joinable() set search_path = '';
alter function public.list_joinable_businesses() set search_path = '';
alter function public.join_business_by_owner(uuid) set search_path = '';

create index if not exists business_join_settings_open_name_idx
  on public.business_join_settings (business_name, owner_id)
  where is_open;

drop policy if exists "Users can view their business memberships" on public.business_members;
create policy "Users can view their business memberships"
  on public.business_members for select to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = user_id);

drop policy if exists "Business members can append sync events" on public.sync_events;
create policy "Business members can append sync events"
  on public.sync_events for insert to authenticated
  with check (
    (select auth.uid()) = actor_id and (
      (select auth.uid()) = owner_id or exists (
        select 1 from public.business_members bm
        where bm.owner_id = sync_events.owner_id and bm.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Business members can read sync events" on public.sync_events;
create policy "Business members can read sync events"
  on public.sync_events for select to authenticated
  using (
    (select auth.uid()) = owner_id or exists (
      select 1 from public.business_members bm
      where bm.owner_id = sync_events.owner_id and bm.user_id = (select auth.uid())
    )
  );
