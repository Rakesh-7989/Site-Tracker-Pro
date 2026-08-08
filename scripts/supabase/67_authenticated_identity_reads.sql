-- SiteTrack Pro — authenticated identity reads (Session 30.14, Phase 3).
--
-- BUG SURFACED BY THE v3 REBUILD: a normal signed-in user could NOT read
-- their own profile / org memberships / organizations. Two stacked gaps:
--
--   1. No table-level GRANT: `authenticated` had zero privileges on
--      profiles, org_members, organizations, projects. PostgREST returned
--      403 "permission denied" BEFORE RLS even evaluated.
--   2. RLS policies only covered admins/superadmins — there was no policy
--      letting a user read their OWN profile or their OWN org memberships.
--
-- The LEGACY app hid this: getCurrentUser() silently degrades to role
-- 'client' on failure, so nobody noticed cloud-mode identity reads were
-- broken. The v3 shell does proper authenticated reads + surfaces the
-- failure, which is how we caught it.
--
-- This migration:
--   - GRANTs the minimum table privileges to `authenticated`
--   - Adds self/membership-scoped SELECT policies (RLS still scopes rows)
--   - Adds a SECURITY DEFINER user_org_ids() helper to avoid RLS recursion
--
-- Security posture: STRICTLY scoped. A user can read:
--   - their own profile row
--   - their own org_members rows
--   - organizations they are an active member of
--   - projects in their orgs (for the project list; detail still gated)
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. Table grants (gate; RLS scopes rows) ─────────────────────────────────
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.org_members TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.projects TO authenticated;

-- ── 2. Helper: caller's active org ids (SECURITY DEFINER → no RLS recursion) ─
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(org_id), '{}')
  FROM public.org_members
  WHERE profile_id = auth.uid()
    AND status = 'active'
    AND removed_at IS NULL
$$;

GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, anon;

-- ── 3. profiles: read own row ───────────────────────────────────────────────
-- (Co-member reads for the Members screen land in Phase 7 with a dedicated
-- SECURITY DEFINER check; hydration only needs self-read.)
DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- ── 4. org_members: read own memberships (active + invited, not removed) ────────────────────────────────────
DROP POLICY IF EXISTS org_members_self_read ON public.org_members;
CREATE POLICY org_members_self_read ON public.org_members
  FOR SELECT
  USING (profile_id = auth.uid() AND status IN ('active','invited'));

-- ── 5. organizations: read orgs I'm an active member of ─────────────────────
DROP POLICY IF EXISTS organizations_member_read ON public.organizations;
CREATE POLICY organizations_member_read ON public.organizations
  FOR SELECT
  USING (id = ANY(public.user_org_ids()));

-- ── 6. projects: read projects in my orgs (list view) ───────────────────────
-- Complements the existing membership-based read_projects policy so org
-- members see the org's project list even before they're assigned to one.
DROP POLICY IF EXISTS projects_org_read ON public.projects;
CREATE POLICY projects_org_read ON public.projects
  FOR SELECT
  USING (org_id = ANY(public.user_org_ids()));

COMMIT;
