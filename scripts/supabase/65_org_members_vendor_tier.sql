-- SiteTrack Pro — org_members vendor tier (Session 30.13, Phase 2).
--
-- R&D gap: vendors (material suppliers) need ORG-LEVEL membership so the
-- vendor portal can scope their access across an org's projects. But
-- org_members.role only allowed 5 values (admin, pm, architect,
-- contractor, client). A vendor had to be mis-filed as 'contractor'.
--
-- This migration adds 'vendor' as a 6th org tier. The TS catalog
-- (src/auth/roles.ts ORG_TIER_ROLES) is updated in lock-step in the same
-- commit so the two cannot drift.
--
-- Vendor org-tier capabilities are minimal (quote + invoice + price view)
-- — see src/auth/permissions-matrix.ts ORG_TIER_CAPS.vendor.
--
-- IDEMPOTENT.

BEGIN;

ALTER TABLE public.org_members
  DROP CONSTRAINT IF EXISTS org_members_role_check;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_role_check CHECK (role IN (
    'admin',
    'pm',
    'architect',
    'contractor',
    'client',
    'vendor'      -- NEW: org-level material supplier (vendor portal)
  ));

COMMENT ON COLUMN public.org_members.role IS
  '6-value org membership tier (v2.1): admin | pm | architect | contractor | client | vendor. Coarse org-level tier; fine-grained per-project role lives in project_members.role. Kept in lock-step with src/auth/roles.ts ORG_TIER_ROLES.';

COMMIT;
