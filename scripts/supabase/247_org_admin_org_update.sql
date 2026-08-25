-- 247_org_admin_org_update.sql
-- FIX: the onboarding wizard's saves silently failed for every self-serve org
-- owner. `updateOrg` writes organizations.{name, contact_email, segment,
-- segments, enabled_modules, billing_period, plan} but:
--   * table grants: migration 67 granted only SELECT to authenticated
--   * RLS: migration 111 allows UPDATE only for is_superadmin()
-- So segment(s)/enabled_modules stayed NULL forever → the four segment-gated
-- nav items (/client, /procurement, /ffe, /vendor-scorecard) never appeared,
-- while onboarding "completed" successfully (ops_toggles write worked).
--
-- Fix: column-scoped UPDATE grant + an org-tier-admin UPDATE policy. Direct
-- org CRUD stays superadmin/staff-only for every other column.

grant update (
  name, contact_email, segment, segments, enabled_modules,
  billing_period, plan, org_type
) on public.organizations to authenticated;

drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update
  on public.organizations
  for update
  using      (public.is_superadmin() or public.has_org_tier(id, 'admin'))
  with check (public.is_superadmin() or public.has_org_tier(id, 'admin'));
