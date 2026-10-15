-- A user's auth UUID remains the shop's stable owner_id. Accepted membership
-- rows let additional authenticated users read and append to that shop's event log.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.business_members (
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('staff')),
  joined_at timestamptz not null default now(),
  primary key (owner_id, user_id),
  unique (user_id),
  check (owner_id <> user_id)
);

create table if not exists public.business_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null default 'Shop',
  code_hash text not null unique,
  invitee_email text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  revoked_at timestamptz
);

create index if not exists business_members_owner_idx on public.business_members(owner_id, joined_at);
create index if not exists business_invites_owner_created_idx on public.business_invites(owner_id, created_at desc);

alter table public.business_members enable row level security;
alter table public.business_members force row level security;
alter table public.business_invites enable row level security;
alter table public.business_invites force row level security;

drop policy if exists "Users can view their business memberships" on public.business_members;
create policy "Users can view their business memberships"
  on public.business_members for select to authenticated
  using (auth.uid() = owner_id or auth.uid() = user_id);

revoke all on public.business_members from anon, authenticated;
grant select on public.business_members to authenticated;
revoke all on public.business_invites from anon, authenticated;

create or replace function public.my_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select bm.owner_id from public.business_members bm where bm.user_id = auth.uid()),
    auth.uid()
  );
$$;
revoke all on function public.my_business_id() from public, anon;
grant execute on function public.my_business_id() to authenticated;

create or replace function public.create_business_invite(
  p_code text,
  p_business_name text,
  p_invitee_email text default null
)
returns table (invite_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_expires timestamptz := now() + interval '14 days';
begin
  if v_uid is null then raise exception 'Sign in before creating an invitation.'; end if;
  if p_code is null or length(trim(p_code)) < 32 or length(trim(p_code)) > 80 then
    raise exception 'Invitation code is invalid.';
  end if;
  insert into public.business_invites(owner_id, business_name, code_hash, invitee_email, created_by, expires_at)
  values (
    v_uid,
    coalesce(nullif(trim(p_business_name), ''), 'Shop'),
    encode(extensions.digest(lower(trim(p_code)), 'sha256'), 'hex'),
    nullif(lower(trim(p_invitee_email)), ''),
    v_uid,
    v_expires
  ) returning id into v_id;
  return query select v_id, v_expires;
end;
$$;
revoke all on function public.create_business_invite(text, text, text) from public, anon;
grant execute on function public.create_business_invite(text, text, text) to authenticated;

create or replace function public.join_business_with_code(p_code text)
returns table (owner_id uuid, business_name text)
language plpgsql
security definer
set search_path = public, extensions
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
  on conflict (owner_id, user_id) do nothing;
  update public.business_invites
    set claimed_by = v_uid, claimed_at = coalesce(claimed_at, now())
    where id = v_invite.id;
  return query select v_invite.owner_id, v_invite.business_name;
end;
$$;
revoke all on function public.join_business_with_code(text) from public, anon;
grant execute on function public.join_business_with_code(text) to authenticated;

drop policy if exists "Users can append their own sync events" on public.sync_events;
create policy "Business members can append sync events"
  on public.sync_events for insert to authenticated
  with check (
    auth.uid() = owner_id
    or exists (
      select 1 from public.business_members bm
      where bm.owner_id = sync_events.owner_id and bm.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read their own sync events" on public.sync_events;
create policy "Business members can read sync events"
  on public.sync_events for select to authenticated
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.business_members bm
      where bm.owner_id = sync_events.owner_id and bm.user_id = auth.uid()
    )
  );
