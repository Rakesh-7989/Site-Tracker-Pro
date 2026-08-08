-- SiteTrack Pro — V6 Phase 1: Multi-org User Support (invitations).
-- Adds invitation lifecycle to org_members so users can belong to
-- multiple orgs with explicit invitation → acceptance flow.
-- Existing schema already supports 1:N org_members per profile;
-- this adds explicit status tracking for invited → active → removed.

BEGIN;

-- 1. Add status + invitation tracking columns to org_members
ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited','active','removed')),
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- 2. Partial index for "pending invitations for a user"
CREATE INDEX IF NOT EXISTS org_members_invited_idx
  ON public.org_members(profile_id)
  WHERE status = 'invited';

-- 3. Update self-read policy: users see their own active + invited rows (not removed)
DROP POLICY IF EXISTS org_members_self_read ON public.org_members;
CREATE POLICY org_members_self_read ON public.org_members
  FOR SELECT
  USING (profile_id = auth.uid() AND status IN ('active','invited'));

-- 4. Update user_org_ids() to only return ACTIVE org memberships
-- (invited orgs should NOT grant data access until accepted)
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(org_id), '{}')
  FROM public.org_members
  WHERE profile_id = auth.uid()
    AND status = 'active'
    AND removed_at IS NULL
$$;

-- 5. Ensure org_members write policies still work with new status
-- (admin insert/update/delete already check role via has_org_tier / current_role_text)
-- No changes needed; status is set by invitation flow, not directly by users.

-- 6. Backfill: existing rows already have status='active' (DEFAULT)
--    and removed_at IS NULL where appropriate — no data migration needed.

COMMIT;