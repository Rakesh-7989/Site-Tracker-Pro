-- SiteTrack Pro — SEC-001 / SEC-004: project scope enforcement (Principal SDE review).
--
-- SEC-001 (P0): create_project_architect INSERT policy allowed any
--   architect/pm/orgadmin/project_admin/prospector to insert a project into
--   ANY org_id — cross-tenant data pollution. Fix: require the target org to be
--   one of the caller's active memberships (org_id = ANY(user_org_ids())),
--   mirroring the orgadmin_create_project posture.
--
-- SEC-004 (P0): update_project_architect UPDATE policy had USING but no WITH
--   CHECK, so an updater could mutate a project's org_id (cross-tenant move).
--   Fix: add a WITH CHECK mirroring USING + an org_id-immutability trigger.
--
-- Idempotent (DROP IF EXISTS / CREATE OR REPLACE). Follows migration 212 style.

BEGIN;

-- SEC-001 — org-membership gate on project creation.
drop policy if exists create_project_architect on projects;
create policy create_project_architect on projects for insert
  with check (
    (
      current_role_text() in ('architect','pm','orgadmin','project_admin','prospector')
      and org_id = any(public.user_org_ids())
    )
    or is_superadmin()
  );

-- SEC-004 — UPDATE passes the same gate AND org_id is immutable.
drop policy if exists update_project_architect on projects;
create policy update_project_architect on projects for update
  using (
    (
      current_role_text() in ('architect','pm','orgadmin','project_admin','prospector')
      and id in (select user_project_ids())
    )
    or is_superadmin()
  )
  with check (
    (
      current_role_text() in ('architect','pm','orgadmin','project_admin','prospector')
      and id in (select user_project_ids())
    )
    or is_superadmin()
  );

create or replace function public.protect_project_org_id()
returns trigger
language plpgsql
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'projects.org_id is immutable (SEC-004)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_protect_org_id on public.projects;
create trigger trg_projects_protect_org_id
  before update of org_id on public.projects
  for each row execute function public.protect_project_org_id();

comment on function public.protect_project_org_id() is
  'SEC-004: blocks any attempt to change a project org_id (cross-tenant move).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass AND tgname = 'trg_projects_protect_org_id'
  ) THEN
    RAISE EXCEPTION 'migration 213 FAILED: org_id protection trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'create_project_architect'
      AND COALESCE(qual, with_check) ILIKE '%user_org_ids()%'
  ) THEN
    RAISE EXCEPTION 'migration 213 FAILED: create_project_architect org-membership check missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'update_project_architect'
      AND with_check IS NOT NULL AND with_check ILIKE '%user_project_ids%'
  ) THEN
    RAISE EXCEPTION 'migration 213 FAILED: update_project_architect WITH CHECK missing';
  END IF;
  RAISE NOTICE 'migration 213 ok: project-scope INSERT + org_id-immutable UPDATE live';
END $$;

COMMIT;