-- SiteTrack Pro — Custom plan = super-admin-only (Session 29).
-- Run AFTER 35_plan_quotas.sql. Idempotent.
--
-- Implements Point 9: "Custom anighi matharam super admin access cheyga
-- galaru" — the Custom plan tier is locked from public signup; only
-- super-admins can grant it. The signup trigger (34) enforces this on
-- the auth.users insert path; the frontend plan picker hides Custom
-- by reading `requires_superadmin`.

alter table public.plans
  add column if not exists requires_superadmin boolean not null default false;

update public.plans
  set requires_superadmin = true
  where id in ('custom', 'enterprise');

-- Optional: helper RPC for UI to filter the public plan list.
create or replace function public.public_plans()
returns setof public.plans language sql stable as $$
  select * from public.plans
   where status = 'active'
     and requires_superadmin = false
   order by display_order asc;
$$;

do $$ declare n int; begin
  select count(*) into n from public.plans where requires_superadmin = false;
  raise notice '36_custom_plan_lock: % public plan(s) self-serve, % super-admin-only.',
    n, (select count(*) from public.plans where requires_superadmin = true);
end $$;
