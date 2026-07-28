-- SiteTrack Pro — Migration 125: Role CRUD base-privilege grants
--
-- The `authenticated` role needs base table privileges so RLS policies
-- can be evaluated.  Without these, even a row-level policy that says
-- ALLOW will fail with "permission denied for table" because the role
-- lacks the underlying INSERT / UPDATE / DELETE / SELECT grant.
--
-- Tables that were already correct (milestones, purchase_orders,
-- invoices, projects, drawings, issues, site_updates, etc.) have all
-- four DML privileges granted to authenticated.  The two tables
-- below were missed.

-- ── org_members ──────────────────────────────────────────────────────────────
-- The application allows org admins to add/remove members through the UI.
-- `org_members_admin_write` policy (RLS) handles row-level scoping.
GRANT INSERT, UPDATE, DELETE ON public.org_members TO authenticated;

-- ── audit_log_v2 ─────────────────────────────────────────────────────────────
-- `audit_log_v2_read_org` policy controls which rows are visible per role.
GRANT SELECT ON public.audit_log_v2 TO authenticated;
