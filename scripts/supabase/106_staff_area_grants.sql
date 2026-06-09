-- 106_staff_area_grants.sql — granular per-staff access to admin areas.
-- Owner/Head always see everything. A Member, by default, sees all areas — but
-- once the head SETS a specific subset, the member is restricted to those.

create table if not exists public.staff_area_grants (
  staff_id   uuid not null references public.profiles(id) on delete cascade,
  area       text not null check (area in ('signups','orgs','users','roles','upgrades')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (staff_id, area)
);
alter table public.staff_area_grants enable row level security;

-- A staff reads their own grants; owner/head read everyone's.
drop policy if exists sag_read on public.staff_area_grants;
create policy sag_read on public.staff_area_grants for select
  using (staff_id = auth.uid() or public.is_staff_head_or_owner());
grant select on public.staff_area_grants to authenticated;

-- Owner/head replace a staff member's area set (empty array → full access again).
create or replace function public.set_staff_areas(p_staff uuid, p_areas text[])
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_head_or_owner() then
    raise exception 'Only the owner or staff head can set staff areas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_staff and staff_tier is not null) then
    raise exception 'Target is not a staff member' using errcode = '22023';
  end if;
  delete from public.staff_area_grants where staff_id = p_staff;
  insert into public.staff_area_grants(staff_id, area, granted_by)
    select p_staff, a, auth.uid()
    from unnest(p_areas) as a
    where a in ('signups','orgs','users','roles','upgrades')
    on conflict do nothing;
  return true;
end $$;
grant execute on function public.set_staff_areas(uuid, text[]) to authenticated;

-- Owner/head: a staff member's current areas.
create or replace function public.list_staff_areas(p_staff uuid)
  returns table (area text)
  language sql stable security definer set search_path = public as $$
  select area from public.staff_area_grants where staff_id = p_staff
$$;
grant execute on function public.list_staff_areas(uuid) to authenticated;
