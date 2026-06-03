-- SiteTrack Pro — org_members soft-delete (Session 30.13, Phase 2).
--
-- R&D audit gap #5B: org_members had NO soft-delete column. Removing a
-- member was a hard DELETE — losing the audit trail of who was in the
-- org and when they left. project_members already has removed_at
-- (migration 59); this brings org_members to parity.
--
-- After this migration, the convention for removing an org member is:
--   UPDATE org_members SET removed_at = now() WHERE ...
-- NOT a DELETE. RLS + app queries filter `removed_at IS NULL` for active
-- members. The audit trigger (migration 61) records the change.
--
-- IDEMPOTENT.

BEGIN;

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

COMMENT ON COLUMN public.org_members.removed_at IS
  'Soft-delete timestamp. NULL = active member. Set instead of DELETE so the membership history survives for audit. See docs/ROLE_ARCHITECTURE.md.';

-- Partial index for the hot path: "active members of an org".
CREATE INDEX IF NOT EXISTS org_members_active_idx
  ON public.org_members(org_id)
  WHERE removed_at IS NULL;

COMMIT;
