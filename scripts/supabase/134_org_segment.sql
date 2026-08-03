-- SiteTrack Pro — v4 Phase C0: Organization Segment
--
-- Adds an optional `segment` column to `organizations` so every company
-- declares what kind of business it is. This is the v4 keystone: it drives
-- segment-aware onboarding, default project type, nav, tabs, and plan
-- contents per company segment.
--
-- The column is nullable for backward compatibility — existing orgs keep
-- `null` until their owner picks a segment (during onboarding / org home).
--
-- JS source of truth: src/auth/segmentConfig.ts#SEGMENTS
--
-- Values (company segments — distinct from project.type):
--   construction  — builders / contractors / developers
--   architecture  — architectural design firms
--   interior      — interior design / fit-out firms
--   consultancy   — structural / MEP / specialist consultancies
--   multiple      — firms spanning several segments (all project types)

BEGIN;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='organizations' and column_name='segment'
  ) then
    alter table public.organizations
      add column segment text
      check (segment in ('construction','architecture','interior','consultancy','multiple'));
  end if;
end$$;

-- Index for segment-filtered dashboards (platform org listings, per-segment stats)
create index if not exists idx_organizations_segment on public.organizations(segment);

-- ============================================================================
-- Migration sanity check
-- ============================================================================
--
-- Existing orgs legitimately have segment = null (they'll be prompted to pick
-- one). New registrations must always stamp a segment — so just report the
-- current state as a notice; a null segment is NOT a migration failure.
do $$ declare n int; begin
  select count(*) into n from public.organizations where segment is null;
  raise notice '134_org_segment: % orgs have null segment (back-compat, will be prompted in onboarding)', n;
  raise notice '134_org_segment: segment counts: %', (
    select coalesce(string_agg(segment || ':' || cnt::text, ', '), 'none')
    from (select segment, count(*) as cnt from public.organizations where segment is not null group by segment) s
  );
end $$;

COMMIT;
