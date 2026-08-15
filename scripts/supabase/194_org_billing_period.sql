-- SiteTrack Pro — P-D unified org signup: record the chosen billing cycle
-- (monthly / annual) on the organization at registration time.
-- Run AFTER 193_project_lifecycle.sql. Idempotent.
--
-- Context (P-D deep-dive, Lead decision):
--   * The two public org paths (`/register` self-service vs `/signup`
--     approval-gated) are unified onto `/register` — the Zoho-style
--     self-service flow. `/signup` now redirects to `/register` preserving
--     plan/billing params.
--   * `/register` previously had NO billing toggle (it always sent the org
--     with the default plan and no billing cycle). The unified flow adds a
--     monthly/annual toggle (annual = "2 months free") and this migration
--     gives that choice a home so pricing shown at signup matches what the
--     org records.
--   * Existing orgs stay NULL (legacy rows without a recorded cycle); new
--     registrations set it via the register_org Edge Function.

do $$
begin
  -- Add the column if missing.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations'
      and column_name = 'billing_period'
  ) then
    alter table public.organizations
      add column billing_period text;
    raise notice '194_org_billing_period: added organizations.billing_period';
  end if;

  -- Constrain the value (nullable for legacy rows).
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_billing_period_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_billing_period_check
      check (billing_period is null or billing_period in ('monthly','annual'));
    raise notice '194_org_billing_period: CHECK added (monthly/annual)';
  end if;
end $$;

do $$ declare n int; begin
  select count(*) into n from public.organizations
    where billing_period is not null;
  raise notice '194_org_billing_period: % org(s) with an explicit billing period.', n;
end $$;
