-- SiteTrack Pro — migration 107: scale-readiness hardening (2026-06-09).
--
-- Audit (3 parallel agents) for "can we hold ~100 orgs?" surfaced:
--   1) missing indexes on FKs hit by RLS subqueries + admin filters → seq scans
--   2) platform_orgs() did 2 correlated COUNT subqueries PER org (N+1)
--   3) the staff-areas editor fired 1 RPC per member (no batch read)
--
-- This migration fixes the DB side: adds the indexes, rewrites platform_orgs()
-- as a single JOIN + GROUP BY, and adds list_all_staff_areas() so the UI can
-- batch-load every member's grants in one round trip. IDEMPOTENT.
--
-- NOTE on CONCURRENTLY: tables are tiny today so a plain CREATE INDEX is instant.
-- When any table grows large, rebuild these with CREATE INDEX CONCURRENTLY
-- (outside a txn) to avoid a write lock.

BEGIN;

-- ── CRITICAL: FKs hit by RLS subqueries on every login / profile read ────────
-- org_members PK is (org_id, profile_id) → lookups by profile_id alone can't use
-- it. user_org_id() / RLS scan `org_members WHERE profile_id = auth.uid()`.
CREATE INDEX IF NOT EXISTS idx_org_members_profile_active
  ON public.org_members (profile_id)
  WHERE removed_at IS NULL;

-- admin_profiles_read scans `project_members WHERE profile_id = X AND project_id IN (...)`.
CREATE INDEX IF NOT EXISTS idx_project_members_profile_project
  ON public.project_members (profile_id, project_id)
  WHERE removed_at IS NULL;

-- ── MODERATE: admin / staff dashboards filter by these ───────────────────────
CREATE INDEX IF NOT EXISTS idx_dpr_messages_org_status_created
  ON public.dpr_messages (org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pur_assigned_staff
  ON public.plan_upgrade_requests (assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signup_assigned_staff
  ON public.signup_requests (assigned_staff_id, status, created_at DESC)
  WHERE assigned_staff_id IS NOT NULL;

-- ── MINOR: staff hierarchy + attribution lookups ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_staff_invites_creator_active
  ON public.staff_invites (created_by, revoked_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_staff_manager
  ON public.profiles (staff_manager_id)
  WHERE staff_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_created_by_staff
  ON public.organizations (created_by_staff)
  WHERE created_by_staff IS NOT NULL;

-- ── platform_orgs(): replace 2 per-row COUNT subqueries with one JOIN+GROUP BY ─
-- Same signature + ordering, so the app needs no change. At 100 orgs this goes
-- from ~200 subquery executions to 2 grouped aggregates.
CREATE OR REPLACE FUNCTION public.platform_orgs()
RETURNS TABLE (id uuid, name text, slug text, plan text, member_count int, project_count int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug, o.plan,
         COALESCE(mc.c, 0)::int AS member_count,
         COALESCE(pc.c, 0)::int AS project_count,
         o.created_at
  FROM public.organizations o
  LEFT JOIN (
    SELECT org_id, count(*) AS c FROM public.org_members
    WHERE removed_at IS NULL GROUP BY org_id
  ) mc ON mc.org_id = o.id
  LEFT JOIN (
    SELECT org_id, count(*) AS c FROM public.projects GROUP BY org_id
  ) pc ON pc.org_id = o.id
  WHERE public.is_superadmin()
  ORDER BY o.created_at DESC;
$$;

-- ── Batch read of every staff member's granted areas (owner/head only) ───────
-- Lets StaffAdminView load all grants in ONE call instead of one-RPC-per-member.
CREATE OR REPLACE FUNCTION public.list_all_staff_areas()
RETURNS TABLE (staff_id uuid, area text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sag.staff_id, sag.area
  FROM public.staff_area_grants sag
  WHERE public.is_staff_head_or_owner();
$$;

GRANT EXECUTE ON FUNCTION public.list_all_staff_areas() TO authenticated;
COMMENT ON FUNCTION public.list_all_staff_areas() IS 'Owner/head: every staff member''s granted admin areas, in one call (batch). Empty otherwise.';

COMMIT;
