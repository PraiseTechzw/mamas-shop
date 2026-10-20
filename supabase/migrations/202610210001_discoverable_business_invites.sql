-- Shops appear in setup only after their owner explicitly opts in. Discovery
-- reveals shop names only; the membership RPC grants access atomically.
create table if not exists public.business_join_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  is_open boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.business_join_settings enable row level security;
alter table public.business_join_settings force row level security;
revoke all on public.business_join_settings from public, anon, authenticated;

create or replace function public.set_business_joinable(p_enabled boolean, p_business_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in before changing shop access.'; end if;
  if exists (select 1 from public.business_members bm where bm.user_id = v_uid) then
    raise exception 'Only the shop owner can change join access.';
  end if;
  if nullif(trim(p_business_name), '') is null then raise exception 'Add a shop name before enabling discovery.'; end if;
  insert into public.business_join_settings(owner_id, business_name, is_open, updated_at)
  values (v_uid, trim(p_business_name), p_enabled, now())
  on conflict (owner_id) do update set business_name = excluded.business_name, is_open = excluded.is_open, updated_at = excluded.updated_at;
  return p_enabled;
end;
$$;
revoke all on function public.set_business_joinable(boolean, text) from public, anon;
grant execute on function public.set_business_joinable(boolean, text) to authenticated;

create or replace function public.get_my_business_joinable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select bjs.is_open from public.business_join_settings bjs where bjs.owner_id = auth.uid()), false);
$$;
revoke all on function public.get_my_business_joinable() from public, anon;
grant execute on function public.get_my_business_joinable() to authenticated;

create or replace function public.list_joinable_businesses()
returns table (owner_id uuid, business_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select bjs.owner_id, bjs.business_name
  from public.business_join_settings bjs
  where bjs.is_open
    and bjs.owner_id <> auth.uid()
    and not exists (
      select 1 from public.business_members bm
      where bm.user_id = auth.uid() and bm.owner_id = bjs.owner_id
    )
  order by bjs.business_name;
$$;
revoke all on function public.list_joinable_businesses() from public, anon;
grant execute on function public.list_joinable_businesses() to authenticated;

create or replace function public.join_business_by_owner(p_owner_id uuid)
returns table (owner_id uuid, business_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shop public.business_join_settings%rowtype;
begin
  if v_uid is null then raise exception 'Sign in before joining a shop.'; end if;
  if p_owner_id is null or p_owner_id = v_uid then raise exception 'Select a shop you do not own.'; end if;
  if exists (select 1 from public.business_members bm where bm.user_id = v_uid and bm.owner_id <> p_owner_id)
     or exists (select 1 from public.business_invites bi where bi.owner_id = v_uid)
     or exists (select 1 from public.sync_events se where se.owner_id = v_uid) then
    raise exception 'This login already owns or belongs to another shop. Use a separate login to join.';
  end if;

  select * into v_shop
  from public.business_join_settings bjs
  where bjs.owner_id = p_owner_id and bjs.is_open
  for update;

  if v_shop.owner_id is null then raise exception 'This shop is no longer accepting members.'; end if;

  insert into public.business_members(owner_id, user_id, role)
  values (v_shop.owner_id, v_uid, 'staff')
  on conflict (owner_id, user_id) do nothing;
  return query select v_shop.owner_id, v_shop.business_name;
end;
$$;
revoke all on function public.join_business_by_owner(uuid) from public, anon;
grant execute on function public.join_business_by_owner(uuid) to authenticated;
