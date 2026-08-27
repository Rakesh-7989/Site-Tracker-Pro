-- Migration 249: Add missing indexes on foreign key columns
--
-- Audit found 165 FK columns without indexes. The most impactful are on
-- core project tables where RLS policies call user_project_ids() or
-- user_org_ids() on every row check. These are plain (non-concurrent)
-- indexes safe for transactional apply. Re-run is idempotent (IF NOT EXISTS).

-- ── Core project tables (project_id FK, RLS scans user_project_ids) ────────
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON public.milestones (project_id);
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON public.issues (project_id);
CREATE INDEX IF NOT EXISTS idx_materials_project_id ON public.materials (project_id);
CREATE INDEX IF NOT EXISTS idx_ra_bills_project_id ON public.ra_bills (project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project_id ON public.purchase_orders (project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project_id ON public.comments (project_id);
CREATE INDEX IF NOT EXISTS idx_site_updates_project_id ON public.site_updates (project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices (project_id);
CREATE INDEX IF NOT EXISTS idx_dpr_messages_project_id ON public.dpr_messages (project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON public.attachments (project_id);
CREATE INDEX IF NOT EXISTS idx_ffe_entries_project_id ON public.ffe_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON public.time_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_project_id ON public.corrective_actions (project_id);

-- ── Chat / notifications (org-scoped RLS, user_org_ids) ────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_org_id ON public.chat_messages (org_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON public.notifications (org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON public.notifications (project_id);

-- ── Org-scoped tables ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vendors_org_id ON public.vendors (org_id);

-- ── Key FK lookups (milestone_id, phase_id on invoices/tasks) ──────────────
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON public.tasks (milestone_id);
CREATE INDEX IF NOT EXISTS idx_invoices_milestone_id ON public.invoices (milestone_id);
CREATE INDEX IF NOT EXISTS idx_invoices_phase_id ON public.invoices (phase_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_phase_id ON public.time_entries (phase_id);

-- ── Audit trail / user FK lookups ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_log_v2_actor_id ON public.audit_log_v2 (actor_id);
CREATE INDEX IF NOT EXISTS idx_expenses_recorded_by ON public.expenses (recorded_by);
CREATE INDEX IF NOT EXISTS idx_download_events_downloaded_by ON public.download_events (downloaded_by);

-- ── Partner / cross-org ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_project_partner_orgs_org_id ON public.project_partner_orgs (org_id);
CREATE INDEX IF NOT EXISTS idx_project_partner_orgs_project_id ON public.project_partner_orgs (project_id);

-- ── Profile lookups (common join target) ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_project_members_profile_id ON public.project_members (profile_id);
CREATE INDEX IF NOT EXISTS idx_org_members_profile_id ON public.org_members (profile_id);

-- ── Attendance / roster ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_profile_id ON public.attendance (profile_id);
CREATE INDEX IF NOT EXISTS idx_shift_roster_project_id ON public.shift_roster (project_id);

-- ── Material requests ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_material_requests_project_id ON public.material_requests (project_id);
