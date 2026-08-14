-- SiteTrack Pro — P-B org project lifecycle: pause / hold / deactivate /
-- reactivate / archive (soft-delete) / delete (superadmin).
-- Run AFTER 192_fk_identity_to_profiles.sql. Idempotent.
--
-- Design (Option A from the deep-dive, Lead decision):
--   * `projects.status` gains two reversible lifecycle states — `paused` and
--     `deactivated` — joining the existing `on_hold`. All three are
--     non-terminal: reactivate = `status → 'active'`.
--   * `completed` / `cancelled` stay terminal states (no forward move except
--     archive/delete or reactivate back to active).
--   * `archived_at` remains the soft-delete tombstone. Archive hard-hides the
--     project from the active list AND frees its quota slot (migrations
--     35/97 already count only `archived_at IS NULL`). Restore clears it and
--     returns status to `active`.
--   * Hard delete is superadmin-only (frontend gates on `project:delete`).

do $$
declare
  v_ok boolean;
begin
  -- Replace the status CHECK with the extended state set, but only if the
  -- new states aren't already admitted (idempotent re-run guard).
  select exists(
    select 1 from pg_constraint
    where conname = 'projects_status_check'
      and conrelid = 'public.projects'::regclass
      and pg_get_constraintdef(oid) like '%paused%'
      and pg_get_constraintdef(oid) like '%deactivated%'
  ) into v_ok;

  if not v_ok then
    alter table public.projects drop constraint if exists projects_status_check;
    alter table public.projects
      add constraint projects_status_check
      check (status in ('active','paused','on_hold','deactivated','completed','cancelled'));
  end if;
end $$;

-- Filter perf: the projects list + lifecycle filter group by status within an org.
create index if not exists idx_projects_org_status on public.projects(org_id, status)
  where archived_at is null;

do $$ declare n int; begin
  select count(*) into n from public.projects where status = 'on_hold';
  raise notice '193_project_lifecycle: status CHECK extended (active/paused/on_hold/deactivated/completed/cancelled). % project(s) currently on hold.', n;
end $$;
