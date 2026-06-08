-- 103_plan_upgrade_requests.sql — org-initiated plan-upgrade requests routed to
-- the platform staff head (who follows up, assigns to a staff, and tracks them).

create table if not exists public.plan_upgrade_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  requested_by    uuid references public.profiles(id) on delete set null,
  current_plan    text,
  desired_plan    text,
  note            text,
  status          text not null default 'open' check (status in ('open','in_progress','closed')),
  assigned_staff_id uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pur_org_idx on public.plan_upgrade_requests(org_id);
create index if not exists pur_status_idx on public.plan_upgrade_requests(status);

alter table public.plan_upgrade_requests enable row level security;

-- Read: platform staff (owner/head see all; member sees assigned-to-them);
-- plus the requesting org's own members can see their org's requests.
drop policy if exists pur_read on public.plan_upgrade_requests;
create policy pur_read on public.plan_upgrade_requests for select using (
  public.is_staff_head_or_owner()
  or assigned_staff_id = auth.uid()
  or org_id in (select org_id from public.org_members where profile_id = auth.uid())
);

-- Writes go through SECURITY DEFINER RPCs below (no direct insert/update policy).

-- 1. org admin (or superadmin) raises an upgrade request -----------------------
create or replace function public.request_plan_upgrade(p_org uuid, p_desired_plan text, p_note text default null)
  returns public.plan_upgrade_requests
  language plpgsql security definer set search_path = public as $$
declare r public.plan_upgrade_requests; v_cur text;
begin
  if not (public.is_superadmin() or exists (
    select 1 from public.org_members where org_id = p_org and profile_id = auth.uid() and role = 'admin'
  )) then
    raise exception 'Only an org admin can request an upgrade' using errcode = '42501';
  end if;
  select plan into v_cur from public.organizations where id = p_org;
  insert into public.plan_upgrade_requests(org_id, requested_by, current_plan, desired_plan, note)
    values (p_org, auth.uid(), v_cur, nullif(trim(coalesce(p_desired_plan,'')),''), nullif(trim(coalesce(p_note,'')),''))
    returning * into r;
  return r;
end $$;

-- 2. owner/head assign a request to a staff -----------------------------------
create or replace function public.assign_upgrade_request(p_request uuid, p_staff uuid)
  returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_head_or_owner() then
    raise exception 'Only the staff head/owner can assign' using errcode = '42501';
  end if;
  if p_staff is not null and not exists (select 1 from public.profiles where id = p_staff and staff_tier is not null) then
    raise exception 'Target is not a staff member' using errcode = '22023';
  end if;
  update public.plan_upgrade_requests
    set assigned_staff_id = p_staff,
        status = case when status = 'open' and p_staff is not null then 'in_progress' else status end,
        updated_at = now()
    where id = p_request;
  return found;
end $$;

-- 3. owner/head/assigned-staff update status + note ---------------------------
create or replace function public.set_upgrade_request_status(p_request uuid, p_status text, p_note text default null)
  returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open','in_progress','closed') then
    raise exception 'Bad status' using errcode = '22023';
  end if;
  if not (public.is_staff_head_or_owner()
          or exists (select 1 from public.plan_upgrade_requests where id = p_request and assigned_staff_id = auth.uid())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.plan_upgrade_requests
    set status = p_status, resolution_note = coalesce(nullif(trim(coalesce(p_note,'')),''), resolution_note), updated_at = now()
    where id = p_request;
  return found;
end $$;

-- 4. staff list (owner/head → all; member → assigned), with org + emails -------
create or replace function public.list_upgrade_requests()
  returns table (
    id uuid, org_id uuid, org_name text, requester_email text, current_plan text,
    desired_plan text, note text, status text, assigned_staff_id uuid,
    assigned_email text, resolution_note text, created_at timestamptz, updated_at timestamptz
  )
  language sql stable security definer set search_path = public as $$
  select r.id, r.org_id, o.name,
         (select email from auth.users where id = r.requested_by),
         r.current_plan, r.desired_plan, r.note, r.status, r.assigned_staff_id,
         (select email from auth.users where id = r.assigned_staff_id),
         r.resolution_note, r.created_at, r.updated_at
  from public.plan_upgrade_requests r
  join public.organizations o on o.id = r.org_id
  where public.is_staff_head_or_owner() or r.assigned_staff_id = auth.uid()
  order by case r.status when 'open' then 0 when 'in_progress' then 1 else 2 end, r.created_at desc;
$$;

grant execute on function public.request_plan_upgrade(uuid,text,text) to authenticated;
grant execute on function public.assign_upgrade_request(uuid,uuid) to authenticated;
grant execute on function public.set_upgrade_request_status(uuid,text,text) to authenticated;
grant execute on function public.list_upgrade_requests() to authenticated;
