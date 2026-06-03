-- SiteTrack Pro — RLS role-helper functions (Session 30.13, Phase 2).
--
-- R&D gap #7 / #5A: RLS policies hardcode role lists like
--   role IN ('architect','pm','project_admin',...)
-- inline across 02_rls.sql, 07_role_expansion.sql, 59_project_members.sql.
-- When a role is renamed / added, every policy file must be hand-edited,
-- and they DRIFT from src/auth/permissions-matrix.ts.
--
-- This migration introduces 3 STABLE SECURITY DEFINER helper functions
-- that policies can call. New policies SHOULD use these instead of inline
-- role lists. Existing policies are NOT rewritten in this migration (that's
-- a careful, separately-tested follow-up) — but the helpers are available
-- and documented so the rebuild's new tables use them from day 1.
--
--   has_identity_role(VARIADIC roles text[])  — profiles.role of caller
--   has_org_tier(p_org_id uuid, VARIADIC roles text[]) — org_members.role
--   has_project_role(p_project_id uuid, VARIADIC roles text[]) — project_members.role
--
-- All return false (deny) when auth.uid() is null.
--
-- IDEMPOTENT.

BEGIN;

-- ── has_identity_role ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_identity_role(VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(p_roles)
  );
$$;

COMMENT ON FUNCTION public.has_identity_role(text[]) IS
  'RLS helper: true when the caller''s profiles.role is in the given list. Use in policies instead of inline role lists so the catalog stays single-sourced.';

-- ── has_org_tier ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_org_tier(p_org_id uuid, VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = p_org_id
      AND profile_id = auth.uid()
      AND role = ANY(p_roles)
      AND removed_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.has_org_tier(uuid, text[]) IS
  'RLS helper: true when the caller is an ACTIVE org_member of p_org_id with a role in the list. Respects removed_at soft-delete.';

-- ── has_project_role ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_project_role(p_project_id uuid, VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND profile_id = auth.uid()
      AND role = ANY(p_roles)
      AND removed_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.has_project_role(uuid, text[]) IS
  'RLS helper: true when the caller is an ACTIVE project_member of p_project_id with a role in the list. Respects removed_at soft-delete.';

-- ── Grants: callable by authenticated (RLS context) ─────────────────────────
GRANT EXECUTE ON FUNCTION public.has_identity_role(text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_org_tier(uuid, text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, text[]) TO authenticated, anon;

-- ── Canonical role-catalog view (documentation + drift detection) ───────────
-- A read-only view listing every role the DB knows about, so a CI check
-- can diff it against src/auth/roles.ts. Not used by policies; purely for
-- observability + the catalog-parity test.
CREATE OR REPLACE VIEW public.role_catalog AS
  SELECT 'identity' AS tier, unnest(ARRAY[
    'superadmin','orgadmin','promoter','project_admin','prospector','pm',
    'architect','senior_architect','junior_architect',
    'design_architect_interior','interior_designer','design_head',
    'consultant_head','mep_consultant','structural_consultant','consultant',
    'designer','site_engineer','civil_engineer','site_supervisor',
    'project_head','contractor','sub_contractor','vendor','client','site_inspector'
  ]) AS role
  UNION ALL
  SELECT 'org', unnest(ARRAY['admin','pm','architect','contractor','client','vendor'])
  UNION ALL
  SELECT 'project', unnest(ARRAY[
    'architect','senior_architect','junior_architect',
    'design_architect_interior','interior_designer','design_head',
    'consultant_head','designer','consultant','mep_consultant',
    'structural_consultant','site_engineer','civil_engineer','site_supervisor',
    'site_inspector','pm','project_admin','project_head','contractor',
    'sub_contractor','client','promoter'
  ]);

COMMENT ON VIEW public.role_catalog IS
  'Canonical role catalog (identity / org / project tiers). Diff against src/auth/roles.ts to detect drift. Not consulted by policies.';

GRANT SELECT ON public.role_catalog TO authenticated, anon;

COMMIT;
