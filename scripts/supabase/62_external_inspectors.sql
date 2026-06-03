-- SiteTrack Pro — external inspectors (Session 30.13, Phase 2).
--
-- Founder decision (docs/ROLE_ARCHITECTURE.md): Site Inspector is an
-- EXTERNAL read-only role (RERA / govt 3rd-party audit), NOT a firm
-- employee. R&D gap #4: there was no clean path to mark a user as an
-- external auditor distinct from a firm member.
--
-- This migration adds an `external_inspectors` table that records which
-- profiles are external auditors for which org, with their inspecting
-- authority (RERA-TG / RERA-KA / RERA-MH / municipal / bank-lender).
-- An external inspector is added to specific projects via project_members
-- with role='site_inspector' (write-once, enforced by migration 59's
-- immutability trigger).
--
-- Why a separate table instead of a profiles flag: an inspector may audit
-- projects across MULTIPLE orgs (e.g. a RERA officer covers many builders).
-- A single boolean on profiles couldn't model that. The table is the
-- (profile, org) edge with the authority + validity window.
--
-- IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.external_inspectors (
  profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  authority      text NOT NULL,
  authority_ref  text,                  -- e.g. RERA officer ID / municipal license no.
  valid_from     date NOT NULL DEFAULT current_date,
  valid_until    date,                  -- NULL = open-ended
  added_by       uuid REFERENCES public.profiles(id),
  added_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  PRIMARY KEY (profile_id, org_id, authority)
);

ALTER TABLE public.external_inspectors
  DROP CONSTRAINT IF EXISTS external_inspectors_authority_check;
ALTER TABLE public.external_inspectors
  ADD CONSTRAINT external_inspectors_authority_check CHECK (authority IN (
    'rera-tg', 'rera-ka', 'rera-mh',
    'municipal', 'bank-lender', 'fire-noc', 'environmental', 'other'
  ));

COMMENT ON TABLE public.external_inspectors IS
  'External 3rd-party auditors (RERA / municipal / lender) who have read-only access to specific projects via project_members.role=site_inspector. One profile can inspect across multiple orgs. See docs/ROLE_ARCHITECTURE.md.';

CREATE INDEX IF NOT EXISTS external_inspectors_org_idx ON public.external_inspectors(org_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS external_inspectors_profile_idx ON public.external_inspectors(profile_id) WHERE revoked_at IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.external_inspectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_inspectors_read ON public.external_inspectors;
DROP POLICY IF EXISTS external_inspectors_write ON public.external_inspectors;

-- READ: org admins of the org + the inspector themselves.
CREATE POLICY external_inspectors_read ON public.external_inspectors
  FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = external_inspectors.org_id
        AND om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  );

-- WRITE: only org admins of that org.
CREATE POLICY external_inspectors_write ON public.external_inspectors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = external_inspectors.org_id
        AND om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = external_inspectors.org_id
        AND om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_inspectors TO authenticated;
REVOKE ALL ON public.external_inspectors FROM anon;

COMMIT;
