-- SiteTrack Pro — Role consolidation (2026-06-04, founder decision).
--
-- The founder reviewed the role diagram and consolidated four redundant
-- roles into their nearest survivor. This migration migrates existing data
-- THEN tightens the CHECK constraints + role_catalog view to match.
--
--   site_supervisor      → site_engineer   (one field role; site_engineer
--                                            already had every cap + voice)
--   civil_engineer       → site_engineer   ("vadu" — dropped, folded to SE)
--   project_head         → pm              (one PM role; pm gains rabill:approve)
--   interior_designer    → design_architect_interior  (one interior design role)
--
-- Result: profiles.role 26 → 22 values, project_members.role 22 → 18.
-- org_members.role unchanged (6). Kept: promoter, designer (design projects).
--
-- Mirrors src/auth/roles.ts (IDENTITY_ROLES 22, PROJECT_TIER_ROLES 18) +
-- the capability merges in src/auth/permissions-matrix.ts.
--
-- IDEMPOTENT: data UPDATEs are no-ops once no old-role rows remain; the
-- constraint DROP/ADD + view CREATE OR REPLACE are inherently re-runnable.

BEGIN;

-- ── 1. Dedupe project_members before the role rewrite ──────────────────────
-- project_members PK is (project_id, profile_id, role). Mapping a source
-- role onto a target that already exists for the same project+profile would
-- violate the PK, so drop the colliding source row first (the target wins).

-- 1a. Source role collides with its own mapped target already present.
DELETE FROM public.project_members src
WHERE src.role IN ('site_supervisor','civil_engineer','project_head','interior_designer')
  AND EXISTS (
    SELECT 1 FROM public.project_members tgt
    WHERE tgt.project_id = src.project_id
      AND tgt.profile_id = src.profile_id
      AND tgt.role = CASE src.role
        WHEN 'site_supervisor'   THEN 'site_engineer'
        WHEN 'civil_engineer'    THEN 'site_engineer'
        WHEN 'project_head'      THEN 'pm'
        WHEN 'interior_designer' THEN 'design_architect_interior'
      END
  );

-- 1b. Both site_supervisor AND civil_engineer map to site_engineer — if a
-- project+profile holds both, keep one (site_supervisor) and drop the other.
DELETE FROM public.project_members ce
WHERE ce.role = 'civil_engineer'
  AND EXISTS (
    SELECT 1 FROM public.project_members ss
    WHERE ss.project_id = ce.project_id
      AND ss.profile_id = ce.profile_id
      AND ss.role = 'site_supervisor'
  );

-- ── 2. Migrate the data (valid under the OLD constraint — both ends exist) ──
UPDATE public.profiles
  SET role = 'site_engineer'
  WHERE role IN ('site_supervisor','civil_engineer');
UPDATE public.profiles
  SET role = 'pm'
  WHERE role = 'project_head';
UPDATE public.profiles
  SET role = 'design_architect_interior'
  WHERE role = 'interior_designer';

UPDATE public.project_members
  SET role = 'site_engineer'
  WHERE role IN ('site_supervisor','civil_engineer');
UPDATE public.project_members
  SET role = 'pm'
  WHERE role = 'project_head';
UPDATE public.project_members
  SET role = 'design_architect_interior'
  WHERE role = 'interior_designer';

-- ── 3. Tighten profiles_role_check (22 values) ─────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN (
    -- Org-level identity roles
    'superadmin',
    'orgadmin',
    'promoter',
    'project_admin',
    'prospector',
    'pm',

    -- Project-level execution
    'architect',
    'senior_architect',
    'junior_architect',
    'design_architect_interior',
    'design_head',
    'consultant_head',
    'mep_consultant',
    'structural_consultant',
    'consultant',
    'designer',
    'site_engineer',
    'site_inspector',

    -- Supply chain
    'contractor',
    'sub_contractor',
    'vendor',

    -- External + client
    'client'
  ));

COMMENT ON COLUMN public.profiles.role IS
  '22-role catalog (v2, consolidated June 4 2026). Identity role — what the user IS. site_supervisor→site_engineer, project_head→pm, interior_designer→design_architect_interior, civil_engineer dropped. See docs/ROLE_DIAGRAM_RECONCILIATION.md.';

-- ── 4. Tighten project_members_role_check (18 values) ──────────────────────
ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_role_check;

ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_role_check CHECK (role IN (
    'architect','senior_architect','junior_architect',
    'design_architect_interior',
    'design_head','consultant_head','designer','consultant',
    'mep_consultant','structural_consultant',
    'site_engineer','site_inspector',
    'pm','project_admin',
    'contractor','sub_contractor',
    'client','promoter'
  ));

-- ── 5. Rebuild role_catalog view (drift-detection source) ──────────────────
CREATE OR REPLACE VIEW public.role_catalog AS
  SELECT 'identity' AS tier, unnest(ARRAY[
    'superadmin','orgadmin','promoter','project_admin','prospector','pm',
    'architect','senior_architect','junior_architect',
    'design_architect_interior','design_head',
    'consultant_head','mep_consultant','structural_consultant','consultant',
    'designer','site_engineer',
    'contractor','sub_contractor','vendor','client','site_inspector'
  ]) AS role
  UNION ALL
  SELECT 'org', unnest(ARRAY['admin','pm','architect','contractor','client','vendor'])
  UNION ALL
  SELECT 'project', unnest(ARRAY[
    'architect','senior_architect','junior_architect',
    'design_architect_interior','design_head',
    'consultant_head','designer','consultant','mep_consultant',
    'structural_consultant','site_engineer',
    'site_inspector','pm','project_admin','contractor',
    'sub_contractor','client','promoter'
  ]);

COMMENT ON VIEW public.role_catalog IS
  'Canonical role catalog (22 identity / 6 org / 18 project). Consolidated June 4 2026. Diff against src/auth/roles.ts to detect drift.';

GRANT SELECT ON public.role_catalog TO authenticated, anon;

COMMIT;
