-- SiteTrack Pro — v4 Phase 1: Organization Enabled Modules
--
-- Adds `enabled_modules` (text[]) to `organizations` so every company
-- declares which product modules it has switched on. Drives module-gated
-- nav + view visibility per company (the "One Platform, Multiple Industry
-- Modules" strategy).
--
-- The column is nullable for backward compatibility — existing orgs keep
-- `null` until their owner picks modules (during onboarding / org home).
-- Semantics:
--   NULL            = not configured yet → every module is treated as enabled
--                     (back-compat; pre-module orgs see the full surface).
--   ARRAY of ids    = only these modules are enabled; everything else hides.
--
-- JS source of truth: src/modules/registry.ts#MODULES
--
-- Module ids (must match the JS registry + templates):
--   projects   — project execution (always-on core)
--   clients    — client portal + handover sign-off
--   site_ops   — site operations (DPR, punch, submittals, permits, MB)
--   design     — design studio (drawings, FF&E, review rounds)
--   consultancy— consultancy engagements (fee phases, time, deliverables)
--   finance    — finance & billing (invoices, RA bills, revenue)
--   procurement— procurement (vendors, POs, quotes, material prices)
--   compliance — compliance & NOC (statutory, RERA/GST filings)
--   people     — people & HR (attendance, labour, worklogs)
--   insights   — analytics, cost forecast, utilization, revenue
--   kiosks     — kiosks & AR overlays

BEGIN;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='organizations' and column_name='enabled_modules'
  ) then
    alter table public.organizations
      add column enabled_modules text[]
      check (
        enabled_modules is null or
        enabled_modules <@ array[
          'projects','clients','site_ops','design','consultancy','finance',
          'procurement','compliance','people','insights','kiosks'
        ]::text[]
      );
  end if;
end$$;

-- GIN index for platform-level "orgs with module X" filtering.
create index if not exists idx_organizations_enabled_modules
  on public.organizations using gin (enabled_modules);

-- ============================================================================
-- Migration sanity check
-- ============================================================================
do $$ declare n int; begin
  select count(*) into n from public.organizations where enabled_modules is null;
  raise notice '155_enabled_modules: % orgs have null enabled_modules (back-compat, all modules shown)', n;
  raise notice '155_enabled_modules: orgs with modules: %', (
    select count(*) from public.organizations where enabled_modules is not null
  );
end $$;

COMMIT;
