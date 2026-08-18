-- SiteTrack Pro — SEC-002 / SEC-003 / AUTH-001: unified project scope (Principal SDE review).
--
-- SEC-002 (P1): projects_org_read SELECT let ANY org member read EVERY project
--   in their orgs via direct table access, while the app hides unassigned
--   projects (memberProjectScope). RLS was wider than the app.
-- SEC-003 (P1): project_members_read SELECT let any org member enumerate the
--   member roster of EVERY project in their orgs (cross-project leak).
-- AUTH-001 (P1): unify the project-scope decision into one function so
--   React (memberProjectScope) and RLS (user_project_ids) agree exactly.
--
-- Design (mirrors src/app/queries.ts memberProjectScope):
--   - superadmin                       -> all projects
--   - org-tier admin (role='admin' or is_admin, active) -> all projects in those orgs
--   - direct project_members (active)  -> their projects
--   - clients                          -> email-matched projects
-- user_project_ids() is SECURITY DEFINER so the org-tier branch must NOT depend
-- on identity role (app grants org-wide via org_members.role/is_admin too).
--
-- Idempotent. Follows migration 213 style.

BEGIN;

-- AUTH-001 — single scope function.
CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Superadmins: every project
  SELECT p.id FROM public.projects p
    WHERE public.is_superadmin()
  UNION
  -- Directly assigned project members (active, not removed)
  SELECT project_id FROM public.project_members
    WHERE profile_id = auth.uid() AND removed_at IS NULL
  UNION
  -- Org-tier admins see all projects in their orgs (role='admin' OR is_admin),
  -- matching the app's memberProjectScope isOrgWide rule for any identity role.
  SELECT p.id FROM public.projects p
    WHERE EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = p.org_id
        AND om.profile_id = auth.uid()
        AND om.status = 'active'
        AND om.removed_at IS NULL
        AND (om.role = 'admin' OR om.is_admin)
    )
  UNION
  -- Clients see projects matching their email
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'client'
      AND p.client_email = current_email()
$$;

COMMENT ON FUNCTION public.user_project_ids() IS
  'Unified project scope (AUTH-001): superadmin all; org-tier admins all projects '
  'in their admin orgs; direct project members their projects; clients email-matched. '
  'Mirrors app memberProjectScope() so React, API and RLS decide identically.';

-- SEC-002 — drop the org-wide SELECT for ANY member; read_projects (via
-- user_project_ids) is now the single SELECT path honoring project scope.
drop policy if exists projects_org_read on public.projects;

-- SEC-003 — project_members SELECT scoped to own rows + accessible projects.
drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select
  using (
    profile_id = auth.uid()
    or project_id in (select public.user_project_ids())
  );

-- Verify: projects_org_read gone; project_members_read scoped; scope unified.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'projects_org_read'
  ) THEN
    RAISE EXCEPTION 'migration 214 FAILED: projects_org_read still present';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_members' AND policyname = 'project_members_read'
      AND COALESCE(qual, '') ILIKE '%user_project_ids%'
  ) THEN
    RAISE EXCEPTION 'migration 214 FAILED: project_members_read scope missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_get_functiondef('public.user_project_ids()'::regprocedure)
    WHERE pg_get_functiondef('public.user_project_ids()'::regprocedure) ILIKE '%om.is_admin%'
  ) THEN
    RAISE EXCEPTION 'migration 214 FAILED: user_project_ids not unified (org-tier admin)';
  END IF;
  RAISE NOTICE 'migration 214 ok: unified project scope live';
END $$;

COMMIT;