-- SiteTrack Pro — Migration 126: Per-role CRUD RLS tightening
--
-- Replaces the coarse v3_write_* (ALL for any project member) and
-- legacy write_* policies with role-specific INSERT/UPDATE/DELETE
-- policies that match the frontend capability matrix.
--
-- Also introduces vendor disambiguation (vendor_profiles table +
-- is_vendor() helper) so vendors who masquerade as 'contractor' in
-- project_members are properly blocked from operations they shouldn't
-- have (e.g. rabill:create, update:add).
--
-- Migration: 125 → 126

-- ============================================================================
-- 1. VENDOR DISAMBIGUATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendor_profiles (
  profile_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name  text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vp_read_own ON public.vendor_profiles;
CREATE POLICY vp_read_own ON public.vendor_profiles FOR SELECT
  USING (profile_id = auth.uid());

GRANT SELECT ON public.vendor_profiles TO authenticated;

-- --------------------------------------------------------------------------
-- 1b. is_vendor() helper
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_vendor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.vendor_profiles WHERE profile_id = auth.uid());
$$;

-- ============================================================================
-- 2. ROLE CHECK HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_role_in(VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT current_role_text() = ANY(p_roles);
$$;

-- --------------------------------------------------------------------------
-- 2b. Project-member helper (SECURITY DEFINER to bypass RLS on project_members)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE profile_id = auth.uid() AND project_id = p_project_id);
$$;

COMMENT ON FUNCTION public.is_project_member(uuid) IS 'Returns true if auth.uid() has a direct membership row for the given project (bypasses RLS on project_members).';

-- ============================================================================
-- 3. FIX can_read_project() — exclude vendors from project_members check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_read_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (SELECT 1 FROM public.projects p
               WHERE p.id = p_project_id AND p.org_id = ANY(public.user_org_ids()))
    OR (NOT public.is_vendor() AND EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p_project_id AND pm.profile_id = auth.uid() AND pm.removed_at IS NULL
        ));
$$;

-- ============================================================================
-- 4. FIX user_project_ids() — exclude vendors from project_members union
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'superadmin'
  UNION
  SELECT project_id FROM public.project_members WHERE profile_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.vendor_profiles WHERE profile_id = auth.uid())
  UNION
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'architect'
      AND p.org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid())
  UNION
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'orgadmin'
      AND p.org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid())
  UNION
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'pm'
      AND p.org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid())
  UNION
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'prospector'
      AND p.org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid())
  UNION
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'project_admin'
      AND p.org_id IN (SELECT org_id FROM public.org_members WHERE profile_id = auth.uid())
  UNION
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'client'
      AND p.client_email = current_email()
$$;

-- --------------------------------------------------------------------------
-- 4b. Fix project_members_read to allow self-read
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS project_members_read ON public.project_members;
CREATE POLICY project_members_read ON public.project_members FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.projects p JOIN public.org_members om ON om.org_id = p.org_id
               WHERE p.id = project_members.project_id AND om.profile_id = auth.uid())
  );

-- ============================================================================
-- 5. DROP OVERLY PERMISSIVE POLICIES
-- ============================================================================

-- v3_write_* (coarse — ALL for any project member)
DROP POLICY IF EXISTS v3_write_milestones ON public.milestones;
DROP POLICY IF EXISTS v3_write_purchase_orders ON public.purchase_orders;
DROP POLICY IF EXISTS v3_write_invoices ON public.invoices;
DROP POLICY IF EXISTS v3_write_expenses ON public.expenses;
DROP POLICY IF EXISTS v3_write_labour_register ON public.labour_register;
DROP POLICY IF EXISTS v3_write_drawings ON public.drawings;
DROP POLICY IF EXISTS v3_write_issues ON public.issues;
DROP POLICY IF EXISTS v3_write_site_updates ON public.site_updates;
DROP POLICY IF EXISTS v3_write_materials ON public.materials;
DROP POLICY IF EXISTS v3_write_ra_bills ON public.ra_bills;

-- Legacy write_* (wrong role lists)
DROP POLICY IF EXISTS write_milestones ON public.milestones;
DROP POLICY IF EXISTS write_pos ON public.purchase_orders;
DROP POLICY IF EXISTS write_invoices ON public.invoices;
DROP POLICY IF EXISTS write_ra_bills ON public.ra_bills;
DROP POLICY IF EXISTS write_updates ON public.site_updates;
DROP POLICY IF EXISTS write_issues ON public.issues;
DROP POLICY IF EXISTS resolve_issues ON public.issues;
DROP POLICY IF EXISTS expenses_write ON public.expenses;
DROP POLICY IF EXISTS write_labour ON public.labour_register;
DROP POLICY IF EXISTS write_drawings_architect ON public.drawings;

-- ============================================================================
-- 6. CREATE V4 ROLE-SPECIFIC POLICIES
-- ============================================================================

-- ── milestones ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_milestones_insert ON public.milestones;
DROP POLICY IF EXISTS v4_milestones_insert ON public.milestones;
CREATE POLICY v4_milestones_insert ON public.milestones FOR INSERT
  WITH CHECK (
    (public.is_role_in('pm','project_admin') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_milestones_update ON public.milestones;
DROP POLICY IF EXISTS v4_milestones_update ON public.milestones;
CREATE POLICY v4_milestones_update ON public.milestones FOR UPDATE
  USING (
    (public.is_role_in('pm','project_admin') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_milestones_delete ON public.milestones;
CREATE POLICY v4_milestones_delete ON public.milestones FOR DELETE
  USING (
    (public.is_role_in('pm') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- ── purchase_orders ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_pos_insert ON public.purchase_orders;
CREATE POLICY v4_pos_insert ON public.purchase_orders FOR INSERT
  WITH CHECK (
    (public.is_role_in('pm') AND project_id IN (SELECT public.user_project_ids()))
    OR (public.is_vendor() AND public.is_project_member(project_id))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_pos_update ON public.purchase_orders;
CREATE POLICY v4_pos_update ON public.purchase_orders FOR UPDATE
  USING (
    (public.is_role_in('project_admin') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_vendor_read_pos ON public.purchase_orders;
CREATE POLICY v4_vendor_read_pos ON public.purchase_orders FOR SELECT
  USING (
    public.is_vendor()
    AND public.is_project_member(project_id)
  );

-- ── invoices ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_invoices_insert ON public.invoices;
CREATE POLICY v4_invoices_insert ON public.invoices FOR INSERT
  WITH CHECK (
    (public.is_role_in('project_admin') AND project_id IN (SELECT public.user_project_ids()))
    OR (public.is_vendor() AND public.is_project_member(project_id))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_invoices_update ON public.invoices;
CREATE POLICY v4_invoices_update ON public.invoices FOR UPDATE
  USING (
    (public.is_role_in('project_admin') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_vendor_read_invoices ON public.invoices;
CREATE POLICY v4_vendor_read_invoices ON public.invoices FOR SELECT
  USING (
    public.is_vendor()
    AND public.is_project_member(project_id)
  );

-- ── expenses ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_expenses_insert ON public.expenses;
CREATE POLICY v4_expenses_insert ON public.expenses FOR INSERT
  WITH CHECK (
    (public.is_role_in('pm') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- ── labour_register ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_labour_insert ON public.labour_register;
CREATE POLICY v4_labour_insert ON public.labour_register FOR INSERT
  WITH CHECK (
    (public.is_role_in('site_engineer') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_labour_update ON public.labour_register;
CREATE POLICY v4_labour_update ON public.labour_register FOR UPDATE
  USING (
    (public.is_role_in('site_engineer') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_labour_delete ON public.labour_register;
CREATE POLICY v4_labour_delete ON public.labour_register FOR DELETE
  USING (
    (public.is_role_in('site_engineer') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- ── drawings ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_drawings_insert ON public.drawings;
CREATE POLICY v4_drawings_insert ON public.drawings FOR INSERT
  WITH CHECK (
    (public.is_role_in('architect','senior_architect','junior_architect','design_architect_interior','design_head','designer','mep_consultant','structural_consultant','pm') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_drawings_update ON public.drawings;
CREATE POLICY v4_drawings_update ON public.drawings FOR UPDATE
  USING (
    (public.is_role_in('architect','senior_architect','junior_architect','design_architect_interior','design_head','designer','mep_consultant','structural_consultant','consultant_head','pm','site_engineer','site_inspector','consultant') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- ── issues ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_issues_insert ON public.issues;
CREATE POLICY v4_issues_insert ON public.issues FOR INSERT
  WITH CHECK (
    (public.is_role_in('architect','senior_architect','junior_architect','pm','site_engineer','contractor','sub_contractor') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_issues_update ON public.issues;
CREATE POLICY v4_issues_update ON public.issues FOR UPDATE
  USING (
    (public.is_role_in('architect','pm','site_engineer') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- ── site_updates ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_updates_insert ON public.site_updates;
CREATE POLICY v4_updates_insert ON public.site_updates FOR INSERT
  WITH CHECK (
    (public.is_role_in('architect','senior_architect','junior_architect','pm','site_engineer','contractor','sub_contractor','mep_consultant','structural_consultant','consultant','designer','design_architect_interior','consultant_head','design_head','project_admin') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_updates_update ON public.site_updates;
CREATE POLICY v4_updates_update ON public.site_updates FOR UPDATE
  USING (
    (public.is_role_in('senior_architect','pm','design_head','site_engineer') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_updates_delete ON public.site_updates;
CREATE POLICY v4_updates_delete ON public.site_updates FOR DELETE
  USING (
    (public.is_role_in('pm','senior_architect') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- ── materials ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_materials_insert ON public.materials;
CREATE POLICY v4_materials_insert ON public.materials FOR INSERT
  WITH CHECK (
    (public.is_role_in('pm','site_engineer','contractor','design_architect_interior') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_materials_update ON public.materials;
CREATE POLICY v4_materials_update ON public.materials FOR UPDATE
  USING (
    (public.is_role_in('pm','site_engineer','design_architect_interior') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS v4_materials_delete ON public.materials;
CREATE POLICY v4_materials_delete ON public.materials FOR DELETE
  USING (
    (public.is_role_in('pm') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- ── ra_bills ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS v4_ra_bills_insert ON public.ra_bills;
CREATE POLICY v4_ra_bills_insert ON public.ra_bills FOR INSERT
  WITH CHECK (
    (public.is_role_in('pm','project_admin') AND project_id IN (SELECT public.user_project_ids()))
    OR (
      public.is_role_in('contractor') AND NOT public.is_vendor()
      AND project_id IN (SELECT public.user_project_ids())
    )
    OR public.is_superadmin()
  );
