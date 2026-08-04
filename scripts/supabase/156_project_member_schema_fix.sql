-- SiteTrack Pro — v4 RBAC hardening: fix stale project_members schema.
-- Run AFTER 155_project_role_type_trigger.sql. Idempotent.
--
-- Background:
--   Migration 01 created project_members.project_role with an inline 4-value
--   CHECK (architect, pm, contractor, client). Postgres auto-named that
--   constraint `project_members_project_role_check`. Migration 59 renamed the
--   column to `role` and re-created the proper 18-value
--   `project_members_role_check`, but only ever dropped the NON-EXISTENT
--   `project_members_role_check` — the stale auto-named 4-value constraint was
--   left behind. Result: on live, a project_members row must satisfy BOTH
--   constraints, so only the 4 legacy roles could ever be written. That broke
--   approve_project_access for any identity role outside the legacy 4.
--
-- This migration:
--   1. Drops the stale 4-value `project_members_project_role_check`. The
--      18-value `project_members_role_check` (migration 59/68) stays the
--      authority.
--   2. Adds a partial UNIQUE index on (project_id, profile_id, role) for
--      active rows (removed_at IS NULL) — migration 59's documented v2 PK
--      shape. The live PK remains (project_id, profile_id) (single role per
--      project per member); this index gives `approve_project_access`
--      ON CONFLICT a real target and matches the catalog parity model.

BEGIN;

-- ── 1. Drop the stale 4-value constraint ────────────────────────────────────
ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_project_role_check;

-- ── 2. Partial unique index on active (project_id, profile_id, role) ────────
CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_profile_role_key
  ON public.project_members (project_id, profile_id, role)
  WHERE removed_at IS NULL;

-- ── 3. Sanity: the 18-value check must still be present ─────────────────────
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM pg_constraint
  WHERE conrelid = 'public.project_members'::regclass
    AND conname = 'project_members_role_check';
  RAISE NOTICE '156_project_member_schema_fix: role_check_present=%', n;
END $$;

COMMIT;
