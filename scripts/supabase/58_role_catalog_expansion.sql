-- SiteTrack Pro — Role catalog expansion (Session 30.12).
--
-- Source: founder's hand-drawn role-architecture diagram (June 3, 2026)
-- + 3 founder decisions (docs/ROLE_ARCHITECTURE.md):
--   1. Promoter (paying firm owner) is a distinct role from Client (unit buyer).
--   2. PM (execution) and Project Admin (paperwork) stay distinct.
--   3. Site Inspector is external read-only (RERA 3rd-party audit shape).
--
-- This migration:
--   1. Extends profiles_role_check to allow 8 additional roles
--      (senior_architect, junior_architect, structural_consultant,
--      design_head, consultant_head, promoter, site_supervisor, vendor).
--   2. Adds projects.type enum (construction | interior | design | consultant).
--   3. Backfills existing projects with type='construction' (Sprint 1 pilots
--      are all construction).
--
-- Migration 59 follows with the project_members table.
--
-- IDEMPOTENT: safe to re-run.

BEGIN;

-- ── 1. Drop + recreate profiles_role_check with the expanded set ────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN (
    -- Org-level identity roles
    'superadmin',
    'orgadmin',
    'promoter',               -- NEW: paying firm owner; distinct from client
    'project_admin',
    'prospector',
    'pm',

    -- Project-level execution
    'architect',
    'senior_architect',       -- NEW: senior arch supervising junior
    'junior_architect',       -- NEW: junior arch doing drafting + revisions
    'design_architect_interior',
    'interior_designer',
    'design_head',            -- NEW: Design Project lead
    'consultant_head',        -- NEW: Consultant Project lead
    'mep_consultant',
    'structural_consultant',  -- NEW: structural engineer / consultant
    'consultant',
    'designer',
    'site_engineer',
    'civil_engineer',
    'site_supervisor',        -- NEW: foreman; Sprint 2 voice DPR origin
    'site_inspector',
    'project_head',

    -- Supply chain
    'contractor',
    'sub_contractor',
    'vendor',                 -- NEW: material supplier role on profile side

    -- External + client
    'client'
  ));

COMMENT ON COLUMN public.profiles.role IS
  '25-role catalog (v2, June 2026). Identity role — what the user IS. Orthogonal to org_members.role (org tier) and project_members.role (per-project assignment). See docs/ROLE_ARCHITECTURE.md.';

-- ── 2. Add projects.type column ─────────────────────────────────────────────
-- Different project types have different role compositions. Backfill
-- existing projects with 'construction' (Sprint 1 pilots).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects' AND column_name='type'
  ) THEN
    ALTER TABLE public.projects
      ADD COLUMN type text NOT NULL DEFAULT 'construction';
  END IF;
END $$;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_type_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_type_check CHECK (type IN (
    'construction',
    'interior',
    'design',
    'consultant'
  ));

COMMENT ON COLUMN public.projects.type IS
  'Project shape. Drives which project_members.role values are valid. Sprint 1 pilots are all construction; interior/design/consultant types unlock multi-discipline pilots in Sprint 4+.';

CREATE INDEX IF NOT EXISTS projects_type_idx ON public.projects(type);

COMMIT;
