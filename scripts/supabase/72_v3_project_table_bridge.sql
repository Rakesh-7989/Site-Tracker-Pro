-- SiteTrack Pro — v3 read/write bridge for legacy project tables (2026-06-04).
--
-- The R&D / Phase-3 latent bug, second wave: the `authenticated` role has NO
-- table GRANT on the project child tables (milestones, tasks, site_updates,
-- issues, expenses, drawings, materials, ...). RLS is enabled but GRANT is
-- checked FIRST, so a v3 user hits "permission denied for table X" before any
-- policy runs. Migration 67 fixed this for profiles/orgs/projects/members; this
-- does it for the feature tables the v3 port (Batch 1+) needs to read/write.
--
-- Approach: two SECURITY DEFINER helpers (no RLS recursion) + a uniform v3
-- read/write policy applied to each table, PLUS the missing GRANT. Existing
-- legacy policies remain (permissive policies are OR-combined, so v3 access is
-- additive). The v3 UI still gates fine-grained capabilities via useCan(); RLS
-- is the backstop: you must be in the project's org / a project member.
--
-- Extensible: add table names to the `tbls` array as later batches need them.
-- IDEMPOTENT.

BEGIN;

-- ── Helpers: can the caller read / write rows of a given project? ───────────
CREATE OR REPLACE FUNCTION public.can_read_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (SELECT 1 FROM public.projects p
               WHERE p.id = p_project_id AND p.org_id = ANY(public.user_org_ids()))
    OR EXISTS (SELECT 1 FROM public.project_members pm
               WHERE pm.project_id = p_project_id AND pm.profile_id = auth.uid() AND pm.removed_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (SELECT 1 FROM public.projects p
               WHERE p.id = p_project_id AND public.has_org_tier(p.org_id, 'admin', 'pm'))
    OR EXISTS (SELECT 1 FROM public.project_members pm
               WHERE pm.project_id = p_project_id AND pm.profile_id = auth.uid() AND pm.removed_at IS NULL);
$$;

COMMENT ON FUNCTION public.can_read_project(uuid) IS
  'v3 RLS helper: caller may read a project''s child rows if superadmin, an org member of the project''s org, or an active project member.';
COMMENT ON FUNCTION public.can_write_project(uuid) IS
  'v3 RLS helper: caller may write a project''s child rows if superadmin, an org admin/pm of the project''s org, or an active project member. UI gates the specific capability.';

GRANT EXECUTE ON FUNCTION public.can_read_project(uuid)  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_write_project(uuid) TO authenticated, anon;

-- ── Apply GRANT + v3 read/write policy to each project child table ──────────
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['milestones','tasks','site_updates','issues','expenses','drawings','materials'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v3_read_'||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v3_write_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.can_read_project(project_id))', 'v3_read_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.can_write_project(project_id)) WITH CHECK (public.can_write_project(project_id))', 'v3_write_'||t, t);
  END LOOP;
END $$;

COMMIT;
