-- SiteTrack Pro — project_members table (Session 30.12).
--
-- v1 had a partial project_members table (project_id, profile_id,
-- project_role, added_at) — no CHECK constraint, no soft-delete column,
-- no assigner audit, no RLS, no inspector immutability guard.
--
-- This migration:
--   1. If the legacy column `project_role` exists, rename to `role`
--      so naming matches org_members.role + profiles.role.
--   2. If the legacy column `added_at` exists, rename to `assigned_at`.
--   3. Adds missing columns: assigned_by, removed_at.
--   4. Adds the role CHECK constraint covering 22 valid values.
--   5. Adds indexes for the common access patterns.
--   6. Enables RLS with read (any org member) + write (admin/pm only) policies.
--   7. Adds the site_inspector immutability trigger (write-once for the
--      external read-only audit role).
--
-- IDEMPOTENT: safe to re-run.

BEGIN;

-- ── 1. Ensure table exists ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id     uuid NOT NULL,
  profile_id     uuid NOT NULL
);

-- ── 2. Rename legacy columns + add missing ones ─────────────────────────────
DO $$
BEGIN
  -- project_role → role (consistency with org_members.role + profiles.role)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members'
      AND column_name='project_role'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members'
      AND column_name='role'
  ) THEN
    ALTER TABLE public.project_members RENAME COLUMN project_role TO role;
  END IF;

  -- added_at → assigned_at
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members'
      AND column_name='added_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members'
      AND column_name='assigned_at'
  ) THEN
    ALTER TABLE public.project_members RENAME COLUMN added_at TO assigned_at;
  END IF;

  -- Add missing columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members' AND column_name='role'
  ) THEN
    ALTER TABLE public.project_members ADD COLUMN role text NOT NULL DEFAULT 'architect';
    ALTER TABLE public.project_members ALTER COLUMN role DROP DEFAULT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members' AND column_name='assigned_at'
  ) THEN
    ALTER TABLE public.project_members ADD COLUMN assigned_at timestamptz NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members' AND column_name='assigned_by'
  ) THEN
    ALTER TABLE public.project_members ADD COLUMN assigned_by uuid REFERENCES public.profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_members' AND column_name='removed_at'
  ) THEN
    ALTER TABLE public.project_members ADD COLUMN removed_at timestamptz;
  END IF;
END $$;

-- ── 3. Foreign keys (only add if missing) ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_members'::regclass
      AND conname = 'project_members_project_id_fkey'
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_members'::regclass
      AND conname = 'project_members_profile_id_fkey'
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 4. Primary key (only add if missing) ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_members'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.project_members
      ADD PRIMARY KEY (project_id, profile_id, role);
  END IF;
END $$;

-- ── 5. CHECK on role ────────────────────────────────────────────────────────
ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_role_check;

ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_role_check CHECK (role IN (
    'architect','senior_architect','junior_architect',
    'design_architect_interior','interior_designer',
    'design_head','consultant_head','designer','consultant',
    'mep_consultant','structural_consultant',
    'site_engineer','civil_engineer','site_supervisor','site_inspector',
    'pm','project_admin','project_head',
    'contractor','sub_contractor',
    'client','promoter'
  ));

COMMENT ON TABLE public.project_members IS
  'Per-project role assignment (v2). Orthogonal to org_members (org tier) and profiles.role (identity). See docs/architecture/ROLE_ARCHITECTURE.md.';

-- ── 6. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS project_members_profile_idx ON public.project_members(profile_id);
CREATE INDEX IF NOT EXISTS project_members_project_idx ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS project_members_active_idx ON public.project_members(project_id) WHERE removed_at IS NULL;

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_members_read ON public.project_members;
DROP POLICY IF EXISTS project_members_write ON public.project_members;

CREATE POLICY project_members_read ON public.project_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.org_members om ON om.org_id = p.org_id
      WHERE p.id = project_members.project_id
        AND om.profile_id = auth.uid()
    )
  );

CREATE POLICY project_members_write ON public.project_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.org_members om ON om.org_id = p.org_id
      WHERE p.id = project_members.project_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('admin','pm')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.org_members om ON om.org_id = p.org_id
      WHERE p.id = project_members.project_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('admin','pm')
    )
  );

-- ── 8. Site Inspector immutability trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_members_inspector_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'site_inspector' THEN
    IF (
      OLD.project_id IS DISTINCT FROM NEW.project_id OR
      OLD.profile_id IS DISTINCT FROM NEW.profile_id OR
      OLD.role IS DISTINCT FROM NEW.role OR
      OLD.assigned_by IS DISTINCT FROM NEW.assigned_by OR
      OLD.assigned_at IS DISTINCT FROM NEW.assigned_at
    ) THEN
      RAISE EXCEPTION 'project_members rows with role=site_inspector are write-once. Use removed_at for soft-delete.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_members_inspector_immutable ON public.project_members;
CREATE TRIGGER trg_project_members_inspector_immutable
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.project_members_inspector_immutable();

-- ── 9. Grants ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
REVOKE ALL ON public.project_members FROM anon;

COMMIT;
