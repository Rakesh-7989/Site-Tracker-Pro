-- SiteTrack Pro — sub-contractor hierarchy (Session 30.13, Phase 2).
--
-- Founder's hand-drawn architecture shows Contractor → Sub-contractor.
-- R&D gap #4C: there was no table to model the parent-contractor →
-- sub-contractor relationship, nor to scope a sub-contractor to a
-- specific trade. Today all contractors are treated uniformly per project.
--
-- This migration adds a `sub_contractors` table linking a sub-contractor
-- (a profile or org_member) to its PARENT contractor within a project,
-- with the scope-of-work / trade. This unlocks Sprint 4 supply-chain
-- features (sub-contractor RA bills nested under the prime contractor).
--
-- IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sub_contractors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- The prime contractor this sub reports to (a project_members row with
  -- role='contractor'). Stored as profile_id for the join.
  parent_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The sub-contractor's own profile.
  sub_profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trade           text NOT NULL,
  scope_of_work   text,
  contract_value_inr bigint,            -- paise; nullable until agreed
  added_by        uuid REFERENCES public.profiles(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz,
  UNIQUE (project_id, parent_profile_id, sub_profile_id, trade)
);

ALTER TABLE public.sub_contractors
  DROP CONSTRAINT IF EXISTS sub_contractors_trade_check;
ALTER TABLE public.sub_contractors
  ADD CONSTRAINT sub_contractors_trade_check CHECK (trade IN (
    'masonry', 'rcc', 'electrical', 'plumbing', 'painting', 'tiling',
    'carpentry', 'fabrication', 'waterproofing', 'hvac', 'glazing',
    'flooring', 'landscaping', 'excavation', 'other'
  ));

COMMENT ON TABLE public.sub_contractors IS
  'Sub-contractor hierarchy: links a sub (sub_profile_id) to its prime contractor (parent_profile_id) within a project, scoped to a trade. Unlocks nested RA bills + scope tracking in Sprint 4. See docs/architecture/ROLE_ARCHITECTURE.md.';

CREATE INDEX IF NOT EXISTS sub_contractors_project_idx ON public.sub_contractors(project_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS sub_contractors_parent_idx ON public.sub_contractors(parent_profile_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS sub_contractors_sub_idx ON public.sub_contractors(sub_profile_id) WHERE removed_at IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.sub_contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_contractors_read ON public.sub_contractors;
DROP POLICY IF EXISTS sub_contractors_write ON public.sub_contractors;

-- READ: any member of the project's org, OR the sub-contractor themselves.
CREATE POLICY sub_contractors_read ON public.sub_contractors
  FOR SELECT
  USING (
    sub_profile_id = auth.uid()
    OR parent_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.org_members om ON om.org_id = p.org_id
      WHERE p.id = sub_contractors.project_id
        AND om.profile_id = auth.uid()
        AND om.removed_at IS NULL
    )
  );

-- WRITE: org admin/pm of the project's org, OR the parent (prime) contractor.
CREATE POLICY sub_contractors_write ON public.sub_contractors
  FOR ALL
  USING (
    parent_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.org_members om ON om.org_id = p.org_id
      WHERE p.id = sub_contractors.project_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('admin', 'pm')
        AND om.removed_at IS NULL
    )
  )
  WITH CHECK (
    parent_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.org_members om ON om.org_id = p.org_id
      WHERE p.id = sub_contractors.project_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('admin', 'pm')
        AND om.removed_at IS NULL
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_contractors TO authenticated;
REVOKE ALL ON public.sub_contractors FROM anon;

COMMIT;
