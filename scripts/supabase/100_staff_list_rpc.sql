-- 100_staff_list_rpc.sql — staff roster with emails for the /admin/staff panel.
-- SECURITY DEFINER so it can read auth.users for the email; gated INSIDE to
-- owner+head (a non-head caller gets zero rows).

drop function if exists public.list_platform_staff();
create function public.list_platform_staff()
  returns table (
    id uuid,
    email text,
    name text,
    staff_tier text,
    manager_email text,
    created_at timestamptz
  )
  language sql stable security definer set search_path = public as $$
  select p.id,
         u.email,
         p.name,
         p.staff_tier,
         (select mu.email from auth.users mu where mu.id = p.staff_manager_id) as manager_email,
         u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.staff_tier is not null
    and public.is_staff_head_or_owner()
  order by case p.staff_tier when 'owner' then 0 when 'head' then 1 else 2 end,
           u.created_at;
$$;

grant execute on function public.list_platform_staff() to authenticated;
