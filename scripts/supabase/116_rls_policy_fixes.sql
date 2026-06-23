-- SiteTrack Pro — RLS policy fixes identified by Phase 2.1 audit (2026-06-23).
--
-- Fixes:
--   1. ops_toggles write — any org member could write feature flags (security hole).
--      Now restricted to superadmin + orgadmin only.
--   2. write_milestones — add project_admin (has milestone:add/edit caps).
--   3. write_ra_bills — add pm + project_admin (identity caps: rabill:create).
--   4. write_pos — add project_admin (identity caps: po:approve).
--   5. write_invoices — add project_admin (identity caps: invoice:create).
--   6. create/update project — add pm (identity caps: project:create, project:settings:edit).
--
-- Audit findings docs/REWRITE_BUILD_PLAN.md §2.1
-- Run after 115_subscription_alerts.sql. Idempotent.

-- ============================================================================
-- 1. ops_toggles: restrict write to superadmin + orgadmin only
-- ============================================================================

drop policy if exists ops_write on ops_toggles;
create policy ops_write on ops_toggles for all
  using (is_superadmin() or (is_orgadmin() and org_id = user_org_id()))
  with check (is_superadmin() or (is_orgadmin() and org_id = user_org_id()));

-- ============================================================================
-- 2. write_milestones: add project_admin
-- ============================================================================

drop policy if exists write_milestones on milestones;
create policy write_milestones on milestones for all
  using (
    current_role_text() in ('architect','pm','project_admin')
    and project_id in (select user_project_ids())
  );

-- ============================================================================
-- 3. write_ra_bills: add pm + project_admin
-- ============================================================================

drop policy if exists write_ra_bills on ra_bills;
create policy write_ra_bills on ra_bills for all
  using (
    current_role_text() in ('architect','contractor','pm','project_admin')
    and project_id in (select user_project_ids())
  );

-- ============================================================================
-- 4. write_pos: add project_admin (po:approve capability)
-- ============================================================================

drop policy if exists write_pos on purchase_orders;
create policy write_pos on purchase_orders for all
  using (
    current_role_text() in ('architect','pm','project_admin')
    and project_id in (select user_project_ids())
  );

-- ============================================================================
-- 5. write_invoices: add project_admin (invoice:create capability)
-- ============================================================================

drop policy if exists write_invoices on invoices;
create policy write_invoices on invoices for all
  using (
    current_role_text() in ('architect','project_admin')
    and project_id in (select user_project_ids())
  );

-- ============================================================================
-- 6. create/update project: add pm
-- ============================================================================

drop policy if exists create_project_architect on projects;
create policy create_project_architect on projects for insert
  with check (
    current_role_text() in ('architect','pm','orgadmin','project_admin')
    or is_superadmin()
  );

drop policy if exists update_project_architect on projects;
create policy update_project_architect on projects for update
  using (
    (current_role_text() in ('architect','pm','orgadmin','project_admin') and id in (select user_project_ids()))
    or is_superadmin()
  );

-- ============================================================================
-- Verification
-- ============================================================================

do $$ begin
  raise notice '116_rls_policy_fixes: applied 6 fixes (ops_toggles, milestones, ra_bills, pos, invoices, projects)';
end $$;
