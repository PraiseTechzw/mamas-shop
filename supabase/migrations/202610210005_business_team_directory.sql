-- Give a signed-in shop owner or member a safe, display-ready roster.
create or replace function public.list_business_team()
returns table (user_id uuid, member_name text, role text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := public.my_business_id();
begin
  return query
  select
    u.id,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      case when u.id = v_owner_id then 'Shop owner' else 'Team member' end
    ),
    case when u.id = v_owner_id then 'owner' else bm.role end,
    coalesce(bm.joined_at, u.created_at)
  from auth.users u
  left join public.business_members bm
    on bm.user_id = u.id and bm.owner_id = v_owner_id
  where u.id = v_owner_id or bm.owner_id = v_owner_id
  order by (u.id = v_owner_id) desc, coalesce(bm.joined_at, u.created_at);
end;
$$;

revoke all on function public.list_business_team() from public, anon;
grant execute on function public.list_business_team() to authenticated;
