-- SiteTrack Pro — v4 RBAC hardening: enforce VALID_PROJECT_ROLES_BY_TYPE at the DB layer.
-- Run AFTER 154_po_quote_link.sql. Idempotent.
--
-- The UI (member-add forms + role dropdowns) already restricts project-tier
-- roles to the set valid for the project's type (src/auth/roles.ts
-- VALID_PROJECT_ROLES_BY_TYPE), but RLS never did — a direct API call could
-- write a role the project type doesn't support (e.g. adding a 'vendor' as
-- 'design_head' on a construction project). This trigger closes that gap.
--
-- Behavior:
--   - BEFORE INSERT OR UPDATE ON project_members
--   - Looks up the owning project's type. NULL project type (legacy rows
--     pre-migration 06) allows all roles (back-compat).
--   - Non-null type: raises unless NEW.role ∈ the valid set for that type.
--   - Sets the same sets as src/auth/roles.ts VALID_PROJECT_ROLES_BY_TYPE —
--     keep the two in sync when roles or project types change.

BEGIN;

-- ── 1. Trigger function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_project_role_by_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text;
BEGIN
  SELECT p.type INTO v_type FROM public.projects p WHERE p.id = NEW.project_id;

  -- Legacy project with no type: allow every role (back-compat).
  IF v_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (
    -- construction
    (v_type = 'construction' AND NEW.role IN (
      'architect','senior_architect','junior_architect',
      'mep_consultant','structural_consultant',
      'site_engineer','site_inspector',
      'pm','project_admin',
      'contractor','sub_contractor','client'
    ))
    -- interior
    OR (v_type = 'interior' AND NEW.role IN (
      'architect','design_architect_interior','mep_consultant',
      'site_engineer','site_inspector',
      'pm','project_admin',
      'contractor','sub_contractor','client'
    ))
    -- design
    OR (v_type = 'design' AND NEW.role IN (
      'design_head','architect','designer',
      'mep_consultant','structural_consultant',
      'project_admin','client'
    ))
    -- consultant
    OR (v_type = 'consultant' AND NEW.role IN (
      'consultant_head','architect','consultant',
      'mep_consultant','structural_consultant',
      'project_admin','client'
    ))
  ) THEN
    RAISE EXCEPTION 'role % is not valid for project type %', NEW.role, v_type
      USING ERRCODE = '23514';   -- check_violation
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_project_role_by_type() IS
  'DB mirror of src/auth/roles.ts VALID_PROJECT_ROLES_BY_TYPE. Rejects project_members rows whose role is invalid for the project type.';

-- ── 2. Trigger ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS project_members_role_by_type_trigger ON public.project_members;

CREATE TRIGGER project_members_role_by_type_trigger
  BEFORE INSERT OR UPDATE OF role, project_id ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_project_role_by_type();

-- ── 3. Sanity notice ───────────────────────────────────────────────────────
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM pg_trigger
  WHERE tgname = 'project_members_role_by_type_trigger' AND NOT tgisinternal;
  RAISE NOTICE '155_project_role_type_trigger: trigger_present=%', n;
END $$;

COMMIT;
