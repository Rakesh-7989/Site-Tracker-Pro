-- SiteTrack Pro — v2 Phase A: project type taxonomy
-- Run AFTER 03_rls_phase1.sql.
-- Idempotent — safe to re-run.
--
-- Adds a `type` column to `projects` so every project row declares which of
-- the 4 SaaS project categories it belongs to. Existing rows default to
-- 'construction' (back-compat — no UI behavior change until Phase C).

-- ============================================================================
-- 1. projects.type column
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='projects' and column_name='type'
  ) then
    alter table public.projects
      add column type text not null default 'construction'
      check (type in ('construction','interior','design','consultant'));
  end if;
end$$;

-- Index for type-filtered dashboards
create index if not exists idx_projects_type on public.projects(type);

-- ============================================================================
-- 2. Migration sanity check
-- ============================================================================

do $$ declare n int; begin
  select count(*) into n from public.projects where type is null;
  if n > 0 then
    raise exception '06_project_types: % projects have null type — migration failed', n;
  end if;
  raise notice '06_project_types: all projects have a type. Counts: %', (
    select string_agg(type || ':' || cnt::text, ', ')
    from (select type, count(*) as cnt from public.projects group by type) s
  );
end $$;
