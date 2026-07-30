-- SiteTrack Pro — Phase 1: Construction Industry Subtypes
--
-- Adds an optional `industry_subtype` column to `projects` so that
-- "construction" projects can be further classified by industry sector
-- (residential, commercial, industrial, infrastructure, institutional,
-- mixed_use). The column is nullable for backward compatibility.
--
-- JS source of truth: src/data/lookups.ts#CONSTRUCTION_INDUSTRIES
-- Runtime type: src/auth/roles.ts#ConstructionIndustry

BEGIN;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='projects' and column_name='industry_subtype'
  ) then
    alter table public.projects
      add column industry_subtype text
      check (industry_subtype in ('residential','commercial','industrial','infrastructure','institutional','mixed_use'));
  end if;
end$$;

-- Index for industry-filtered dashboards
create index if not exists idx_projects_industry on public.projects(industry_subtype);

COMMIT;
