-- 130_fix_profiles_role_check.sql — align profiles_role_check with the 22-role catalog.
--
-- Problem: migration 68 (role consolidation) was never applied to live DB.
-- The profiles_role_check constraint currently allows only 18 values (from
-- migration 58), missing 7 new roles:
--   promoter, senior_architect, junior_architect, design_head,
--   consultant_head, structural_consultant, vendor
--
-- And still allowing 3 deprecated roles:
--   project_head, civil_engineer, interior_designer
--
-- Fix: drop the old constraint and add the correct 22-value constraint.
-- Additionally, migrate any rows with old role values to their consolidated
-- equivalents so the ALTER TABLE does not fail.
--
-- IDEMPOTENT.

BEGIN;

-- Migrate any profiles with old/consolidated roles to their new equivalents.
-- Migration 68 consolidated: project_head→pm, civil_engineer→site_engineer,
-- interior_designer→design_architect_interior
UPDATE public.profiles SET role = 'pm'                   WHERE role = 'project_head';
UPDATE public.profiles SET role = 'site_engineer'         WHERE role = 'civil_engineer';
UPDATE public.profiles SET role = 'design_architect_interior' WHERE role = 'interior_designer';

-- Now safely replace the constraint.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN (
    -- Platform staff
    'superadmin',
    -- Org-level identity roles
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

COMMIT;
