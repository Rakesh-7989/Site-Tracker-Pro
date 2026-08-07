-- SiteTrack Pro — RLS role-helper functions (Session 30.13, Phase 2).
--
-- R&D gap #7 / #5A: RLS policies hardcode role lists like
--   role IN ('architect','pm','project_admin',...)
-- inline across 02_rls.sql, 07_role_expansion.sql, 59_project_members.sql.
-- When a role is renamed / added, every policy file must be hand-edited,
-- and they DRIFT from src/auth/permissions-matrix.ts.
--
-- This migration introduces 3 STABLE SECURITY DEFINER helper functions
-- that policies can call. New policies SHOULD use these instead of inline
-- role lists. Existing policies are NOT rewritten in this migration (that's
-- a careful, separately-tested follow-up) — but the helpers are available
-- and documented so the rebuild's new tables use them from day 1.
--
--   has_identity_role(VARIADIC roles text[])  — profiles.role of caller
--   has_org_tier(p_org_id uuid, VARIADIC roles text[]) — org_members.role
--   has_project_role(p_project_id uuid, VARIADIC roles text[]) — project_members.role
--
-- All return false (deny) when auth.uid() is null.
--
-- IDEMPOTENT.

BEGIN;

-- ── has_identity_role ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_identity_role(VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(p_roles)
  );
$$;

COMMENT ON FUNCTION public.has_identity_role(text[]) IS
  'RLS helper: true when the caller''s profiles.role is in the given list. Use in policies instead of inline role lists so the catalog stays single-sourced.';

-- ── has_org_tier ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_org_tier(p_org_id uuid, VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = p_org_id
      AND profile_id = auth.uid()
      AND role = ANY(p_roles)
      AND removed_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.has_org_tier(uuid, text[]) IS
  'RLS helper: true when the caller is an ACTIVE org_member of p_org_id with a role in the list. Respects removed_at soft-delete.';

-- ── has_project_role ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_project_role(p_project_id uuid, VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND profile_id = auth.uid()
      AND role = ANY(p_roles)
      AND removed_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.has_project_role(uuid, text[]) IS
  'RLS helper: true when the caller is an ACTIVE project_member of p_project_id with a role in the list. Respects removed_at soft-delete.';

-- ── Grants: callable by authenticated (RLS context) ─────────────────────────
GRANT EXECUTE ON FUNCTION public.has_identity_role(text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_org_tier(uuid, text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, text[]) TO authenticated, anon;

-- ── Canonical role-catalog view (documentation + drift detection) ───────────
-- A read-only view listing every role the DB knows about, so a CI check
-- can diff it against src/auth/roles.ts. Not used by policies; purely for
-- observability + the catalog-parity test.
CREATE OR REPLACE VIEW public.role_catalog AS
  SELECT 'identity' AS tier, unnest(ARRAY[
    'superadmin','orgadmin','promoter','project_admin','prospector','pm',
    'architect','senior_architect','junior_architect',
    'design_architect_interior','interior_designer','design_head',
    'consultant_head','mep_consultant','structural_consultant','consultant',
    'designer','site_engineer','civil_engineer','site_supervisor',
    'project_head','contractor','sub_contractor','vendor','client','site_inspector'
  ]) AS role
  UNION ALL
  SELECT 'org', unnest(ARRAY['admin','pm','architect','contractor','client','vendor'])
  UNION ALL
  SELECT 'project', unnest(ARRAY[
    'architect','senior_architect','junior_architect',
    'design_architect_interior','interior_designer','design_head',
    'consultant_head','designer','consultant','mep_consultant',
    'structural_consultant','site_engineer','civil_engineer','site_supervisor',
    'site_inspector','pm','project_admin','project_head','contractor',
    'sub_contractor','client','promoter'
  ]);

COMMENT ON VIEW public.role_catalog IS
  'Canonical role catalog (identity / org / project tiers). Diff against src/auth/roles.ts to detect drift. Not consulted by policies.';

GRANT SELECT ON public.role_catalog TO authenticated, anon;

-- ── Capability ↔ RLS gate map (v4 C1 + C2, comment-only) ──────────────────
-- Policies in 137_time_entries / 138_fee_phases / 139_deliverables /
-- 141_rate_cards_time_approval / 142_retainers_invoice_generation are
-- ROLE-BASED (manager lists + project membership) and do NOT reference
-- capabilities. The identifiers below are the capabilities in
-- src/auth/capabilities.ts that gate the same actions in the UI — kept as
-- comments so the capability catalog stays single-sourced and drift-checkable
-- (step 4 of the capabilities.ts checklist).
--
--   time_entries  (insert/update/delete)  → time:log, time:manage, time:approve
--   fee_phases    (manager write)          → phase:manage
--   deliverables  (member write / manager delete) → deliverable:manage, deliverable:approve
--   review_rounds (member write / manager close)  → review:comment, review:manage
--   utilization report (org)               → utilization:view
--   rate_cards    (manager write)          → rate:manage
--   retainers     (manager write)          → retainer:manage
--   invoices source tags / generation RPCs → billing:generate
--   revenue report (org)                   → revenue:view
--
-- ── Capability ↔ RLS gate map (v4 D, comment-only) ──────────────────────
-- D features (FF&E / statutory / procurement) are gated at plan + RBAC
-- level in src/auth/planCaps.ts + permissions-matrix.ts; their tables
-- (ffe_entries / statutory_approvals, migrations 150/151) will use the
-- same member-read / manager-write role-based policy pattern as 145/146:
--   ffe_entries      (manager write)       → ffe:manage
--   statutory_approvals (manager write)    → statutory:manage
--   procurement compare view (org)         → procurement:view
--
-- ── Capability ↔ RLS gate map (v4 Phase A CRM, comment-only) ──────────────
-- 161 (crm_leads) is org-scoped: read/insert/update = any org member
-- (`user_org_ids()`), delete = managers (orgadmin/pm/project_admin/superadmin).
-- Policies are ROLE-BASED (no capability references); the identifiers below
-- are the capabilities in src/auth/capabilities.ts that gate the same
-- actions in the UI — kept as comments (step 4 of the capabilities.ts
-- checklist):
--   leads read / pipeline view (org)          → crm:view
--   leads + meetings/quotes/agreements write  → crm:manage
--   sales→project handoff (createProject)     → crm:manage + project:create
--
-- ── Capability ↔ RLS gate map (v4 Phase C consultancy audit, comment-only) ──
-- 163 (consultancy_audits) is project-scoped: read = any project member
-- (`user_project_ids()`); insert/update/delete = managers + orgadmin
-- (pm/project_admin/design_head/consultant_head/superadmin). Policies are
-- ROLE-BASED (no capability references); identifiers below are the
-- capabilities in src/auth/capabilities.ts that gate the same actions in UI:
--   inspection_checklists + results + consultancy_reports write → audit:manage
--
-- RLS gap note: invoices / retainers / rate_cards read gates are project
-- membership-based; org-wide rollups (utilization/revenue) therefore only
-- surface projects the caller is already a member of — by design.

COMMIT;
