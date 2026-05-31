-- SiteTrack Pro — Session 25 Miss-fix 4: project archive column.
-- Run AFTER 07_role_expansion.sql. Idempotent.
--
-- Adds `archived_at` to projects so soft-delete + 90-day restore works on the
-- Supabase side (mirrors src/lib/projectArchive.js).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'archived_at'
  ) then
    alter table public.projects
      add column archived_at timestamptz;
  end if;
end$$;

create index if not exists idx_projects_archived_at on public.projects(archived_at)
  where archived_at is not null;

-- Optional purge query (run via daily pg_cron or Edge Function):
--   delete from public.projects
--    where archived_at is not null
--      and archived_at < now() - interval '90 days';
-- We deliberately don't ship this as a trigger so an admin can review the
-- candidate list first.

do $$ declare n int; begin
  select count(*) into n from public.projects where archived_at is not null;
  raise notice '08_project_archive: column ready. % project(s) currently archived.', n;
end $$;
