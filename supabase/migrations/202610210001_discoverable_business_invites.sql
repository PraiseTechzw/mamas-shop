-- Shops appear in setup only when an owner has created an active, open invite.
-- Discovery reveals names only; joining still requires an atomic server-side claim.
create or replace function public.list_joinable_businesses()
returns table (owner_id uuid, business_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (bi.owner_id) bi.owner_id, bi.business_name
  from public.business_invites bi
  where bi.invitee_email is null
    and bi.claimed_by is null
    and bi.revoked_at is null
    and bi.expires_at > now()
    and bi.owner_id <> auth.uid()
    and not exists (
      select 1 from public.business_members bm
      where bm.user_id = auth.uid() and bm.owner_id = bi.owner_id
    )
  order by bi.owner_id, bi.created_at desc;
$$;
revoke all on function public.list_joinable_businesses() from public, anon;
grant execute on function public.list_joinable_businesses() to authenticated;

create or replace function public.join_business_by_owner(p_owner_id uuid)
returns table (owner_id uuid, business_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.business_invites%rowtype;
begin
  if v_uid is null then raise exception 'Sign in before joining a shop.'; end if;
  if p_owner_id is null or p_owner_id = v_uid then raise exception 'Select a shop you do not own.'; end if;
  if exists (select 1 from public.business_members bm where bm.user_id = v_uid and bm.owner_id <> p_owner_id)
     or exists (select 1 from public.business_invites bi where bi.owner_id = v_uid)
     or exists (select 1 from public.sync_events se where se.owner_id = v_uid) then
    raise exception 'This login already owns or belongs to another shop. Use a separate login to join.';
  end if;

  select * into v_invite
  from public.business_invites bi
  where bi.owner_id = p_owner_id
    and bi.invitee_email is null
    and bi.claimed_by is null
    and bi.revoked_at is null
    and bi.expires_at > now()
  order by bi.created_at desc
  limit 1
  for update;

  if v_invite.id is null then raise exception 'This shop is no longer accepting members.'; end if;

  insert into public.business_members(owner_id, user_id, role)
  values (v_invite.owner_id, v_uid, 'staff')
  on conflict (owner_id, user_id) do nothing;
  update public.business_invites set claimed_by = v_uid, claimed_at = now() where id = v_invite.id;
  return query select v_invite.owner_id, v_invite.business_name;
end;
$$;
revoke all on function public.join_business_by_owner(uuid) from public, anon;
grant execute on function public.join_business_by_owner(uuid) to authenticated;
