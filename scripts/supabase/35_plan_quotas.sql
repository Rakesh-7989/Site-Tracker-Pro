-- SiteTrack Pro — Plan-based quota enforcement (Session 29).
-- Run AFTER 34_signup_self_serve.sql. Idempotent.
--
-- Implements Point 8: "Plan ne batti eni project create chesukovachi, eni
-- role create cheen-rovachu" — projects + users + storage capped by plan
-- tier. Hard-enforced at the DB level so even direct REST inserts can't
-- exceed the limit.
--
-- feature_caps shape (from 28_plans.sql seed):
--   { "projects_max": 5, "users_max": 25, "storage_gb": 20, ... }
-- A null value means "unlimited" (Custom / Enterprise tier).

-- ════════════════════════════════════════════════════════════════════
-- 1. Generic limit checker — used by triggers below.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.plan_cap(p_org_id uuid, p_cap text)
returns int language sql stable as $$
  select nullif(p.feature_caps->>p_cap, '')::int
    from public.organizations o
    join public.plans p on p.id = o.plan
   where o.id = p_org_id;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 2. Project count limit
-- ════════════════════════════════════════════════════════════════════

create or replace function public.check_project_limit() returns trigger
language plpgsql as $$
declare cap int; cnt int;
begin
  cap := public.plan_cap(new.org_id, 'projects_max');
  if cap is null then return new; end if;          -- unlimited plan
  select count(*) into cnt from public.projects
    where org_id = new.org_id and archived_at is null;
  if cnt >= cap then
    raise exception 'plan-limit-exceeded: % project(s) of %', cnt, cap
      using errcode = 'P0001',
            hint = format('Upgrade your plan in Org Admin → Billing to add more projects.');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_project_limit on public.projects;
create trigger trg_check_project_limit
  before insert on public.projects
  for each row execute function public.check_project_limit();

-- ════════════════════════════════════════════════════════════════════
-- 3. User (org_members) limit
-- ════════════════════════════════════════════════════════════════════

create or replace function public.check_user_limit() returns trigger
language plpgsql as $$
declare cap int; cnt int;
begin
  cap := public.plan_cap(new.org_id, 'users_max');
  if cap is null then return new; end if;
  select count(*) into cnt from public.org_members where org_id = new.org_id;
  if cnt >= cap then
    raise exception 'plan-limit-exceeded: % member(s) of %', cnt, cap
      using errcode = 'P0001',
            hint = format('Upgrade your plan in Org Admin → Billing to add more members.');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_user_limit on public.org_members;
create trigger trg_check_user_limit
  before insert on public.org_members
  for each row execute function public.check_user_limit();

-- ════════════════════════════════════════════════════════════════════
-- 4. Helper RPC — UI reads this before showing "+ New project" button
-- ════════════════════════════════════════════════════════════════════

create or replace function public.org_quota_snapshot(p_org_id uuid)
returns table(
  resource text,
  current_count bigint,
  max_allowed int,
  at_quota boolean
) language plpgsql stable as $$
declare cap int;
begin
  cap := public.plan_cap(p_org_id, 'projects_max');
  resource := 'projects';
  select count(*) into current_count from public.projects
    where org_id = p_org_id and archived_at is null;
  max_allowed := cap;
  at_quota := cap is not null and current_count >= cap;
  return next;

  cap := public.plan_cap(p_org_id, 'users_max');
  resource := 'users';
  select count(*) into current_count from public.org_members where org_id = p_org_id;
  max_allowed := cap;
  at_quota := cap is not null and current_count >= cap;
  return next;
end;
$$;

do $$ begin raise notice '35_plan_quotas: triggers live on projects + org_members. snapshot RPC available.'; end $$;
