-- 132_restrict_user_project_ids.sql — restrict user_project_ids() to only
-- superadmin, orgadmin, and direct project_members.
--
-- Previously, pm, architect, prospector, project_admin, and client roles could
-- see ALL projects in their org through user_project_ids(). With project-level
-- member gating, only orgadmin (who manages the org and approves requests) and
-- direct project_members should see project data.
--
-- This is SAFE because:
--   - Superadmins still see everything
--   - Org admins still see everything (need to manage & approve requests)
--   - Everyone else must be explicitly added via the "Add Members" UI
--   - Child table RLS (tasks, milestones, etc.) all use user_project_ids() so
--     non-members are blocked at the DB level too
--
-- IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Superadmins: every project
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'superadmin'
  UNION
  -- Project members directly assigned (active, not removed)
  SELECT project_id FROM public.project_members
    WHERE profile_id = auth.uid() AND removed_at IS NULL
  UNION
  -- Org admins see all projects in their org (needed for approval flow)
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'orgadmin'
      AND p.org_id IN (SELECT org_id FROM public.org_members
                       WHERE profile_id = auth.uid() AND role = 'admin' AND removed_at IS NULL)
  UNION
  -- Clients see projects matching their email
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'client'
      AND p.client_email = current_email()
$$;

COMMENT ON FUNCTION public.user_project_ids() IS
  'Returns project IDs the current user can access. Only superadmin, orgadmin '
  '(active admin of the org), direct project_members, and email-matched clients. '
  'All other identity roles (pm, architect, prospector, project_admin) must be '
  'explicitly added as project members to gain access.';

COMMIT;
