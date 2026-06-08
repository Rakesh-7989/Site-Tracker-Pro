-- 101_staff_followups.sql — staff phase-3 follow-ups:
--   (a) staff roster now reports each member's managed-org count (attribution)
--   (b) assign_signup_to_staff() — route an (enterprise) signup request to a staff

-- (a) recreate list_platform_staff with managed_orgs (return type changes → drop first)
drop function if exists public.list_platform_staff();
create function public.list_platform_staff()
  returns table (
    id uuid, email text, name text, staff_tier text,
    manager_email text, managed_orgs int, created_at timestamptz
  )
  language sql stable security definer set search_path = public as $$
  select p.id,
         u.email,
         p.name,
         p.staff_tier,
         (select mu.email from auth.users mu where mu.id = p.staff_manager_id) as manager_email,
         (select count(*)::int from public.organizations o where o.created_by_staff = p.id) as managed_orgs,
         u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.staff_tier is not null
    and public.is_staff_head_or_owner()
  order by case p.staff_tier when 'owner' then 0 when 'head' then 1 else 2 end,
           u.created_at;
$$;
grant execute on function public.list_platform_staff() to authenticated;

-- (b) assign a signup request to a staff member (owner/head/superadmin)
create or replace function public.assign_signup_to_staff(p_request uuid, p_staff uuid)
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_staff_head_or_owner() or public.is_superadmin()) then
    raise exception 'Only staff head/owner or a superadmin can assign requests' using errcode = '42501';
  end if;
  if p_staff is not null and not exists (
    select 1 from public.profiles where id = p_staff and staff_tier is not null
  ) then
    raise exception 'Target is not a staff member' using errcode = '22023';
  end if;
  update public.signup_requests set assigned_staff_id = p_staff where id = p_request;
  return found;
end $$;
grant execute on function public.assign_signup_to_staff(uuid, uuid) to authenticated;
