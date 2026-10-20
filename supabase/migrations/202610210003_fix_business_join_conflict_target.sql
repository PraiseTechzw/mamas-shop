-- PL/pgSQL functions that return owner_id also expose owner_id as an output
-- variable. Name the membership primary-key constraint explicitly so the
-- ON CONFLICT target cannot be confused with that output variable.
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
  on conflict on constraint business_members_pkey do nothing;
  return query select v_shop.owner_id, v_shop.business_name;
end;
$$;
revoke all on function public.join_business_by_owner(uuid) from public, anon;
grant execute on function public.join_business_by_owner(uuid) to authenticated;

-- The invitation join uses the same return-column names and had the same
-- ambiguous conflict target, so fix that path in the same repair migration.
create or replace function public.join_business_with_code(p_code text)
returns table (owner_id uuid, business_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.business_invites%rowtype;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'Sign in before joining a business.'; end if;
  if p_code is null or length(trim(p_code)) < 32 or length(trim(p_code)) > 80 then
    raise exception 'Invitation code is invalid.';
  end if;

  select * into v_invite
  from public.business_invites bi
  where bi.code_hash = encode(extensions.digest(lower(trim(p_code)), 'sha256'), 'hex')
  for update;

  if v_invite.id is null or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception 'This invitation is invalid or has expired.';
  end if;
  if v_invite.invitee_email is not null and lower(v_invite.invitee_email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'This invitation was issued to a different email address.';
  end if;

  if exists (select 1 from public.business_invites bi where bi.owner_id = v_uid)
     or exists (select 1 from public.sync_events se where se.owner_id = v_uid) then
    raise exception 'This login owns a business. Use a separate staff login to join another shop.';
  end if;

  select bm.owner_id into v_existing from public.business_members bm where bm.user_id = v_uid;
  if v_existing is not null and v_existing <> v_invite.owner_id then
    raise exception 'This login already belongs to another business. Use a separate staff login to join this shop.';
  end if;
  if v_invite.owner_id = v_uid then raise exception 'You already own this business.'; end if;
  if v_invite.claimed_by is not null and v_invite.claimed_by <> v_uid then
    raise exception 'This invitation has already been used.';
  end if;

  insert into public.business_members(owner_id, user_id, role)
  values (v_invite.owner_id, v_uid, 'staff')
  on conflict on constraint business_members_pkey do nothing;
  update public.business_invites
    set claimed_by = v_uid, claimed_at = coalesce(claimed_at, now())
    where id = v_invite.id;
  return query select v_invite.owner_id, v_invite.business_name;
end;
$$;
revoke all on function public.join_business_with_code(text) from public, anon;
grant execute on function public.join_business_with_code(text) to authenticated;
