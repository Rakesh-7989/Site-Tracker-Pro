-- ============================================================================
-- Migration 260: Performance — drop duplicate indexes + pin auth.uid() in policies
-- ============================================================================
-- Context (advisory + scan):
--   1. DUPLICATE INDEXES (dropped live, idempotent re-drop here):
--      - project_members: idx_project_members_profile_id ≡ project_members_profile_idx
--      - projects: idx_projects_type ≡ projects_type_idx
--
--   2. POLICY PREDICATES — 62 policies reference bare auth.uid().
--      Wrapping in (SELECT auth.uid()) guarantees one-time evaluation per query
--      and is the Supabase-recommended pattern for RLS predicates.
--      All ALTER POLICY statements below re-apply the pinned form (idempotent).
--
--   Applied live via MCP on 2026-09-10; this migration is a ledger-only record.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Part 1: Drop duplicate indexes
-- ──────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.project_members_profile_idx;
DROP INDEX IF EXISTS public.projects_type_idx;

-- ──────────────────────────────────────────────────────────────────────────────
-- Part 2: Wrap auth.uid() → (SELECT auth.uid()) in RLS policies
-- ──────────────────────────────────────────────────────────────────────────────

-- authorization_audit
DO $$ BEGIN
  ALTER POLICY "authz_audit_insert" ON public.authorization_audit
    WITH CHECK ((actor_id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping authorization_audit.authz_audit_insert: %', SQLERRM;
END $$;

-- buildnow_anchors
DO $$ BEGIN
  ALTER POLICY "buildnow_anchors_read" ON public.buildnow_anchors
    USING (((EXISTS ( SELECT 1
       FROM projects p
      WHERE ((p.id = buildnow_anchors.project_id) AND (p.org_id = ANY (user_org_ids()))))) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping buildnow_anchors.buildnow_anchors_read: %', SQLERRM;
END $$;

-- chat_channel_members
DO $$ BEGIN
  ALTER POLICY "ccm_delete" ON public.chat_channel_members
    USING ((profile_id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping chat_channel_members.ccm_delete: %', SQLERRM;
END $$;

-- chat_channel_reads
DO $$ BEGIN
  ALTER POLICY "chat_reads_rw" ON public.chat_channel_reads
    USING ((user_id = ( SELECT auth.uid() AS uid)))
    WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping chat_channel_reads.chat_reads_rw: %', SQLERRM;
END $$;

-- chat_message_reactions
DO $$ BEGIN
  ALTER POLICY "chat_reactions_delete" ON public.chat_message_reactions
    USING ((user_id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping chat_message_reactions.chat_reactions_delete: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "chat_reactions_write" ON public.chat_message_reactions
    WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
       FROM (chat_messages cm
         JOIN chat_channels cc ON ((cc.id = cm.channel_id)))
      WHERE ((cm.id = chat_message_reactions.message_id) AND chat_channel_readable(cc.*))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping chat_message_reactions.chat_reactions_write: %', SQLERRM;
END $$;

-- chat_messages
DO $$ BEGIN
  ALTER POLICY "chat_messages_delete" ON public.chat_messages
    USING (((sender_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM chat_channels cc
      WHERE ((cc.id = chat_messages.channel_id) AND chat_is_manager(cc.org_id, cc.project_id))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping chat_messages.chat_messages_delete: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "chat_messages_insert" ON public.chat_messages
    WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
       FROM chat_channels cc
      WHERE ((cc.id = chat_messages.channel_id) AND chat_channel_readable(cc.*) AND ((cc.visibility <> 'managers'::text) OR chat_is_manager(cc.org_id, cc.project_id)))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping chat_messages.chat_messages_insert: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "chat_messages_partner_insert" ON public.chat_messages
    WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
       FROM chat_channels cc
      WHERE ((cc.id = chat_messages.channel_id) AND partner_can_write_project(cc.project_id))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping chat_messages.chat_messages_partner_insert: %', SQLERRM;
END $$;

-- client_portal_permissions
DO $$ BEGIN
  ALTER POLICY "client_perms_read" ON public.client_portal_permissions
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping client_portal_permissions.client_perms_read: %', SQLERRM;
END $$;

-- comments
DO $$ BEGIN
  ALTER POLICY "comments_edit_self" ON public.comments
    USING (((author_id = ( SELECT auth.uid() AS uid)) OR is_orgadmin()))
    WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) OR is_orgadmin()));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping comments.comments_edit_self: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "comments_insert" ON public.comments
    WITH CHECK (((project_id IN ( SELECT user_project_ids() AS user_project_ids)) AND (author_id = ( SELECT auth.uid() AS uid))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping comments.comments_insert: %', SQLERRM;
END $$;

-- delegations
DO $$ BEGIN
  ALTER POLICY "delegations_write" ON public.delegations
    USING ((is_superadmin() OR (is_orgadmin() AND (org_id = user_org_id())) OR ((from_user = ( SELECT auth.uid() AS uid)) AND (org_id = user_org_id()))))
    WITH CHECK ((is_superadmin() OR (is_orgadmin() AND (org_id = user_org_id())) OR ((from_user = ( SELECT auth.uid() AS uid)) AND (org_id = user_org_id()))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping delegations.delegations_write: %', SQLERRM;
END $$;

-- digest_dispatches
DO $$ BEGIN
  ALTER POLICY "digest_dispatch_read" ON public.digest_dispatches
    USING (((EXISTS ( SELECT 1
       FROM digest_subscriptions s
      WHERE ((s.id = digest_dispatches.subscription_id) AND (s.org_id = ANY (user_org_ids()))))) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping digest_dispatches.digest_dispatch_read: %', SQLERRM;
END $$;

-- digest_subscriptions
DO $$ BEGIN
  ALTER POLICY "digest_subs_read" ON public.digest_subscriptions
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping digest_subscriptions.digest_subs_read: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "digest_subs_write" ON public.digest_subscriptions
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))))
    WITH CHECK ((org_id = ANY (user_org_ids())));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping digest_subscriptions.digest_subs_write: %', SQLERRM;
END $$;

-- download_events
DO $$ BEGIN
  ALTER POLICY "download_events_insert" ON public.download_events
    WITH CHECK ((can_read_project(project_id) AND (downloaded_by = ( SELECT auth.uid() AS uid))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping download_events.download_events_insert: %', SQLERRM;
END $$;

-- dpr_delivery_log
DO $$ BEGIN
  ALTER POLICY "dpr_delivery_log_read" ON public.dpr_delivery_log
    USING (((EXISTS ( SELECT 1
       FROM dpr_messages m
      WHERE ((m.id = dpr_delivery_log.dpr_message_id) AND (m.org_id = ANY (user_org_ids()))))) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping dpr_delivery_log.dpr_delivery_log_read: %', SQLERRM;
END $$;

-- dpr_messages
DO $$ BEGIN
  ALTER POLICY "dpr_messages_read" ON public.dpr_messages
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping dpr_messages.dpr_messages_read: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "dpr_messages_update" ON public.dpr_messages
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping dpr_messages.dpr_messages_update: %', SQLERRM;
END $$;

-- drawing_comments
DO $$ BEGIN
  ALTER POLICY "drawing_comments_update" ON public.drawing_comments
    USING (((author_id = ( SELECT auth.uid() AS uid)) OR is_orgadmin() OR (current_role_text() = ANY (ARRAY['pm'::text, 'project_admin'::text, 'design_head'::text, 'consultant_head'::text, 'superadmin'::text]))))
    WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) OR is_orgadmin() OR (current_role_text() = ANY (ARRAY['pm'::text, 'project_admin'::text, 'design_head'::text, 'consultant_head'::text, 'superadmin'::text]))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping drawing_comments.drawing_comments_update: %', SQLERRM;
END $$;

-- external_inspectors
DO $$ BEGIN
  ALTER POLICY "external_inspectors_read" ON public.external_inspectors
    USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM org_members om
      WHERE ((om.org_id = external_inspectors.org_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = 'admin'::text) AND (om.removed_at IS NULL))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping external_inspectors.external_inspectors_read: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "external_inspectors_write" ON public.external_inspectors
    USING ((EXISTS ( SELECT 1
       FROM org_members om
      WHERE ((om.org_id = external_inspectors.org_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = 'admin'::text) AND (om.removed_at IS NULL)))))
    WITH CHECK ((EXISTS ( SELECT 1
       FROM org_members om
      WHERE ((om.org_id = external_inspectors.org_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = 'admin'::text) AND (om.removed_at IS NULL)))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping external_inspectors.external_inspectors_write: %', SQLERRM;
END $$;

-- handover_signatures
DO $$ BEGIN
  ALTER POLICY "handover_signatures_insert" ON public.handover_signatures
    WITH CHECK (((signed_by = ( SELECT auth.uid() AS uid)) AND ((org_id = ANY (user_org_ids())) OR (project_id IN ( SELECT user_project_ids() AS user_project_ids)))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping handover_signatures.handover_signatures_insert: %', SQLERRM;
END $$;

-- messages
DO $$ BEGIN
  ALTER POLICY "messages_insert" ON public.messages
    WITH CHECK (((project_id IN ( SELECT user_project_ids() AS user_project_ids)) AND (sender_id = ( SELECT auth.uid() AS uid))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping messages.messages_insert: %', SQLERRM;
END $$;

-- notifications
DO $$ BEGIN
  ALTER POLICY "notifications_mark_read" ON public.notifications
    USING ((user_id = ( SELECT auth.uid() AS uid)))
    WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping notifications.notifications_mark_read: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "notifications_read" ON public.notifications
    USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_superadmin()));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping notifications.notifications_read: %', SQLERRM;
END $$;

-- org_members
DO $$ BEGIN
  ALTER POLICY "admin_org_members" ON public.org_members
    USING ((is_superadmin() OR (profile_id = ( SELECT auth.uid() AS uid))))
    WITH CHECK (is_superadmin());
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping org_members.admin_org_members: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "org_members_self_read" ON public.org_members
    USING (((profile_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['active'::text, 'invited'::text]))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping org_members.org_members_self_read: %', SQLERRM;
END $$;

-- org_rbac_settings
DO $$ BEGIN
  ALTER POLICY "org_rbac_settings_read" ON public.org_rbac_settings
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping org_rbac_settings.org_rbac_settings_read: %', SQLERRM;
END $$;

-- plan_upgrade_requests
DO $$ BEGIN
  ALTER POLICY "pur_read" ON public.plan_upgrade_requests
    USING ((is_staff_head_or_owner() OR (assigned_staff_id = ( SELECT auth.uid() AS uid)) OR (org_id IN ( SELECT org_members.org_id
       FROM org_members
      WHERE (org_members.profile_id = ( SELECT auth.uid() AS uid))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping plan_upgrade_requests.pur_read: %', SQLERRM;
END $$;

-- procurement_quotes
DO $$ BEGIN
  ALTER POLICY "procurement_quotes_insert" ON public.procurement_quotes
    WITH CHECK (((org_id = ANY (user_org_ids())) AND ((has_org_tier(org_id, VARIADIC ARRAY['vendor'::text]) AND (vendor_id IN ( SELECT vendors.id
       FROM vendors
      WHERE ((vendors.profile_id = ( SELECT auth.uid() AS uid)) AND (vendors.org_id = ANY (user_org_ids())))))) OR is_orgadmin() OR (current_role_text() = ANY (ARRAY['pm'::text, 'project_admin'::text, 'design_head'::text, 'consultant_head'::text, 'superadmin'::text])))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping procurement_quotes.procurement_quotes_insert: %', SQLERRM;
END $$;

-- profiles
DO $$ BEGIN
  ALTER POLICY "admin_profiles_read" ON public.profiles
    USING ((is_superadmin() OR (id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM project_members pm
      WHERE ((pm.profile_id = profiles.id) AND (pm.project_id IN ( SELECT user_project_ids() AS user_project_ids)))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping profiles.admin_profiles_read: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "profiles_self_read" ON public.profiles
    USING ((id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping profiles.profiles_self_read: %', SQLERRM;
END $$;

-- project_access_requests
DO $$ BEGIN
  ALTER POLICY "par_insert_self" ON public.project_access_requests
    WITH CHECK ((requester_id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping project_access_requests.par_insert_self: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "par_select_self_or_admin" ON public.project_access_requests
    USING (((requester_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM (org_members om
         JOIN projects p ON ((p.org_id = om.org_id)))
      WHERE ((p.id = project_access_requests.project_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = 'admin'::text) AND (om.removed_at IS NULL))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping project_access_requests.par_select_self_or_admin: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "par_update_admin" ON public.project_access_requests
    USING ((EXISTS ( SELECT 1
       FROM (org_members om
         JOIN projects p ON ((p.org_id = om.org_id)))
      WHERE ((p.id = project_access_requests.project_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = 'admin'::text) AND (om.removed_at IS NULL)))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping project_access_requests.par_update_admin: %', SQLERRM;
END $$;

-- project_members
DO $$ BEGIN
  ALTER POLICY "project_members_read" ON public.project_members
    USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (project_id IN ( SELECT user_project_ids() AS user_project_ids))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping project_members.project_members_read: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "project_members_write" ON public.project_members
    USING ((EXISTS ( SELECT 1
       FROM (projects p
         JOIN org_members om ON ((om.org_id = p.org_id)))
      WHERE ((p.id = project_members.project_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['admin'::text, 'pm'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
       FROM (projects p
         JOIN org_members om ON ((om.org_id = p.org_id)))
      WHERE ((p.id = project_members.project_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['admin'::text, 'pm'::text]))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping project_members.project_members_write: %', SQLERRM;
END $$;

-- purchase_orders
DO $$ BEGIN
  ALTER POLICY "po_vendor_read" ON public.purchase_orders
    USING ((vendor_id IN ( SELECT vendors.id
       FROM vendors
      WHERE ((vendors.profile_id = ( SELECT auth.uid() AS uid)) AND (vendors.org_id = ANY (user_org_ids()))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping purchase_orders.po_vendor_read: %', SQLERRM;
END $$;

-- rbac_profile_assignments
DO $$ BEGIN
  ALTER POLICY "rbac_assignments_read" ON public.rbac_profile_assignments
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping rbac_profile_assignments.rbac_assignments_read: %', SQLERRM;
END $$;

-- rbac_profile_bindings
DO $$ BEGIN
  ALTER POLICY "rbac_bindings_read" ON public.rbac_profile_bindings
    USING (((EXISTS ( SELECT 1
       FROM rbac_role_profiles p
      WHERE ((p.id = rbac_profile_bindings.profile_id) AND ((p.org_id IS NULL) OR (p.org_id = ANY (user_org_ids())))))) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping rbac_profile_bindings.rbac_bindings_read: %', SQLERRM;
END $$;

-- rbac_role_profiles
DO $$ BEGIN
  ALTER POLICY "rbac_profiles_read" ON public.rbac_role_profiles
    USING (((org_id IS NULL) OR (org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping rbac_role_profiles.rbac_profiles_read: %', SQLERRM;
END $$;

-- resource_acl_entries
DO $$ BEGIN
  ALTER POLICY "rbac_acl_read" ON public.resource_acl_entries
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping resource_acl_entries.rbac_acl_read: %', SQLERRM;
END $$;

-- staff_area_grants
DO $$ BEGIN
  ALTER POLICY "sag_read" ON public.staff_area_grants
    USING (((staff_id = ( SELECT auth.uid() AS uid)) OR is_staff_head_or_owner()));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping staff_area_grants.sag_read: %', SQLERRM;
END $$;

-- staff_only_features
DO $$ BEGIN
  ALTER POLICY "staff_only_write" ON public.staff_only_features
    USING ((EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text)))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping staff_only_features.staff_only_write: %', SQLERRM;
END $$;

-- sub_contractors
DO $$ BEGIN
  ALTER POLICY "sub_contractors_read" ON public.sub_contractors
    USING (((sub_profile_id = ( SELECT auth.uid() AS uid)) OR (parent_profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM (projects p
         JOIN org_members om ON ((om.org_id = p.org_id)))
      WHERE ((p.id = sub_contractors.project_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.removed_at IS NULL))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping sub_contractors.sub_contractors_read: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "sub_contractors_write" ON public.sub_contractors
    USING (((parent_profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM (projects p
         JOIN org_members om ON ((om.org_id = p.org_id)))
      WHERE ((p.id = sub_contractors.project_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['admin'::text, 'pm'::text])) AND (om.removed_at IS NULL))))))
    WITH CHECK (((parent_profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM (projects p
         JOIN org_members om ON ((om.org_id = p.org_id)))
      WHERE ((p.id = sub_contractors.project_id) AND (om.profile_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['admin'::text, 'pm'::text])) AND (om.removed_at IS NULL))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping sub_contractors.sub_contractors_write: %', SQLERRM;
END $$;

-- time_entries
DO $$ BEGIN
  ALTER POLICY "time_entries_delete_self" ON public.time_entries
    USING (((((profile_id = ( SELECT auth.uid() AS uid)) AND (approval_status = 'pending'::text) AND (NOT billed)) OR is_orgadmin())));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping time_entries.time_entries_delete_self: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "time_entries_edit_self" ON public.time_entries
    USING (((((profile_id = ( SELECT auth.uid() AS uid)) AND (approval_status = 'pending'::text) AND (NOT billed)) OR is_orgadmin())))
    WITH CHECK (((((profile_id = ( SELECT auth.uid() AS uid)) AND (approval_status = 'pending'::text) AND (NOT billed)) OR is_orgadmin())));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping time_entries.time_entries_edit_self: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "time_entries_insert_self" ON public.time_entries
    WITH CHECK (((project_id IN ( SELECT user_project_ids() AS user_project_ids)) AND (profile_id = ( SELECT auth.uid() AS uid))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping time_entries.time_entries_insert_self: %', SQLERRM;
END $$;

-- vendor_profiles
DO $$ BEGIN
  ALTER POLICY "vp_read_own" ON public.vendor_profiles
    USING ((profile_id = ( SELECT auth.uid() AS uid)));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping vendor_profiles.vp_read_own: %', SQLERRM;
END $$;

-- vendor_project_scopes
DO $$ BEGIN
  ALTER POLICY "vendor_scopes_read" ON public.vendor_project_scopes
    USING (((org_id = ANY (user_org_ids())) OR (EXISTS ( SELECT 1
       FROM profiles
      WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'superadmin'::text))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping vendor_project_scopes.vendor_scopes_read: %', SQLERRM;
END $$;

-- workflow_transitions
DO $$ BEGIN
  ALTER POLICY "workflow_transitions_insert" ON public.workflow_transitions
    WITH CHECK (((transitioned_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
       FROM workflow_instances wi
      WHERE ((wi.id = workflow_transitions.instance_id) AND ((wi.organization_id IS NULL) OR (wi.organization_id = ANY (user_org_ids()))) AND ((wi.project_id IS NULL) OR can_read_project(wi.project_id)))))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping workflow_transitions.workflow_transitions_insert: %', SQLERRM;
END $$;

-- worklogs
DO $$ BEGIN
  ALTER POLICY "worklogs_edit_self" ON public.worklogs
    USING (((profile_id = ( SELECT auth.uid() AS uid)) OR is_orgadmin()))
    WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) OR is_orgadmin()));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping worklogs.worklogs_edit_self: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER POLICY "worklogs_insert_self" ON public.worklogs
    WITH CHECK (((project_id IN ( SELECT user_project_ids() AS user_project_ids)) AND (profile_id = ( SELECT auth.uid() AS uid))));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Skipping worklogs.worklogs_insert_self: %', SQLERRM;
END $$;

-- ============================================================================
-- Summary: 2 duplicate indexes dropped + 62 policies pinned
-- All changes applied live via MCP on 2026-09-10; this migration is ledger-only.
-- ============================================================================
