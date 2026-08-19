-- SiteTrack Pro — BIZ-001..004: project lifecycle enforcement server-side.
--
-- Closes the server-side lifecycle gap (plan item 1.6). Today the lifecycle
-- state machine lives ONLY in the client (`src/lib/projectLifecycle.ts`):
-- status transitions and `archived_at` archive/restore are plain PostgREST
-- UPDATEs on `projects`, gated only by the generic role-based UPDATE policies
-- (`update_project_architect` migration 213, `orgadmin_update_project` 03).
-- That means:
--   * BIZ-001 — illegal transitions (e.g. `paused -> on_hold`, `completed ->
--     cancelled`) succeed via a direct API call; only the UI prevents them.
--   * BIZ-002 — terminal states (`completed`/`cancelled`) are mutable; a
--     direct call can move a completed project back to `paused`.
--   * BIZ-003/004 — archive/restore (`archived_at` set/clear) are authorized
--     ONLY by the frontend `project:archive`/`project:restore` capabilities
--     (identity orgadmin OR org-tier admin OR superadmin). The DB has no such
--     gate, so any in-scope updater (architect/pm/prospector) can archive or
--     restore a project by calling the API directly.
--
-- Fix: one BEFORE UPDATE trigger that mirrors the client state machine and
-- the capability grants exactly, so every path (UI, direct API, RPC) is
-- validated server-side. Idempotent. Follows the migration 213 style.
--
-- Runs AFTER 193_project_lifecycle.sql (the extended 6-state CHECK) and
-- 213_project_scope_rls.sql (project-scope UPDATE policies).

BEGIN;

create or replace function public.guard_project_lifecycle_transition()
returns trigger
language plpgsql
as $$
declare
  v_allowed text[] := '{}';
begin
  -- 1. Status transition legality — mirror nextLifecycleOptions() exactly.
  --    A no-op (old = new) is always legal: `restoreProject` re-sends the
  --    current status as 'active' even when it is unchanged.
  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'active'          then array['paused','on_hold','deactivated','completed','cancelled']
      when 'paused'          then array['active','completed','cancelled']
      when 'on_hold'         then array['active','completed','cancelled']
      when 'deactivated'     then array['active','completed','cancelled']
      when 'completed'       then array['active']   -- reactivate only (terminal)
      when 'cancelled'       then array['active']   -- reactivate only (terminal)
      else '{}'::text[]
    end;
    if not (new.status = any(v_allowed)) then
      raise exception 'project_lifecycle: illegal status transition % -> % (BIZ-001/002)',
        old.status, new.status;
    end if;
  end if;

  -- 2. Archive/restore authorization — mirror `project:archive`/`project:restore`
  --    grants: identity orgadmin, org-tier admin, or superadmin.
  if new.archived_at is distinct from old.archived_at then
    if not (
      is_orgadmin()
      or has_org_tier(new.org_id, 'admin')
      or is_superadmin()
    ) then
      raise exception 'project_lifecycle: archive/restore requires an org admin (BIZ-003/004)';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_lifecycle_guard on public.projects;
create trigger trg_projects_lifecycle_guard
  before update of status, archived_at on public.projects
  for each row execute function public.guard_project_lifecycle_transition();

comment on function public.guard_project_lifecycle_transition() is
  'BIZ-001..004: validates project lifecycle transitions + archive/restore authz server-side (mirrors projectLifecycle.ts + project:archive/restore capability grants).';

DO $$
DECLARE
  v_fn text;
  v_trg record;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'guard_project_lifecycle_transition';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'migration 223 FAILED: guard_project_lifecycle_transition() missing';
  END IF;

  SELECT * INTO v_trg FROM pg_trigger
  WHERE tgrelid = 'public.projects'::regclass
    AND tgname = 'trg_projects_lifecycle_guard';
  IF v_trg IS NULL THEN
    RAISE EXCEPTION 'migration 223 FAILED: trg_projects_lifecycle_guard missing';
  END IF;
  IF (v_trg.tgtype & 2) = 0 OR (v_trg.tgtype & 16) = 0 THEN
    -- tgtype bitmask: 2 = BEFORE, 16 = UPDATE. (19 = ROW + BEFORE + UPDATE.)
    RAISE EXCEPTION 'migration 223 FAILED: trigger not BEFORE UPDATE: tgtype=%', v_trg.tgtype;
  END IF;

  RAISE NOTICE 'migration 223 ok: lifecycle guard trigger + transition validation live';
END $$;

COMMIT;