-- SiteTrack Pro — unified org deletion (consolidates delete_organization + admin_delete_org).
--
-- One RPC to rule them all. The DELETE order avoids FK violations from AFTER
-- triggers on org_members / project_members (migration 61) that INSERT into
-- audit_log_v2 with the now-deleted org_id.
--
-- Order:
--   1. Authorize
--   2. Write audit entry (org still exists)
--   3. SET app.allow_audit_delete = 'true'  ← bypasses immutability trigger + role triggers
--   4. DELETE audit_log_v2               ← bypasses trg_audit_log_v2_immutable (mig 100)
--   5. DELETE org_members                ← explicit, BEFORE cascade
--      → trg_audit_org_member_role fires, sees allow_audit_delete='true', skips INSERT
--   6. DELETE projects (CASCADE to project_members etc.)
--      → trg_audit_project_member_role fires, sees allow_audit_delete='true', skips INSERT
--   7. DELETE SET NULL orphan tables      ← DPDP right-to-erasure (no orphaned rows)
--      (whatsapp_log, cashfree_events, voice_transcripts, signup_requests)
--   8. DELETE organizations               ← cascade handles remaining 20+ tables
--      (audit_log_v2, org_members, projects already gone — no triggers fire)
--   9. RESET app.allow_audit_delete = 'false'
--
-- IDEMPOTENT.

BEGIN;

-- ── Unified delete RPC ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_org(p_org uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_actor_name text;
  v_actor_role text;
BEGIN
  -- Authorize: platform staff OR org admin
  IF NOT (public.is_staff_org_admin() OR public.has_org_tier(p_org, 'admin')) THEN
    RAISE EXCEPTION 'not authorized to delete this organization';
  END IF;

  SELECT o.name, p.name, p.role
    INTO v_name, v_actor_name, v_actor_role
    FROM public.organizations o
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = p_org;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization not found');
  END IF;

  -- Write audit entry before deletion (org still exists)
  INSERT INTO public.audit_log_v2(
    org_id, actor_id, actor_name, actor_role,
    action, resource, resource_id, message, after
  ) VALUES (
    p_org, auth.uid(), v_actor_name, v_actor_role,
    'DELETE', 'organization', p_org::text,
    COALESCE(v_actor_name, 'A staff member') || ' deleted organization "' || v_name || '": ' || COALESCE(p_reason, 'no reason given'),
    jsonb_build_object('reason', p_reason, 'deleted_name', v_name)
  );

  -- Bypass all audit-log triggers during cleanup
  PERFORM set_config('app.allow_audit_delete', 'true', true);

  -- Purge audit trail (bypasses trg_audit_log_v2_immutable)
  DELETE FROM public.audit_log_v2 WHERE org_id = p_org;

  -- Delete member rows first so their AFTER triggers fire while org still exists
  DELETE FROM public.org_members WHERE org_id = p_org;
  DELETE FROM public.projects WHERE org_id = p_org;

  -- Purge SET NULL orphan tables (DPDP right-to-erasure — no orphaned rows)
  DELETE FROM public.whatsapp_log WHERE org_id = p_org;
  DELETE FROM public.cashfree_events WHERE org_id = p_org;
  DELETE FROM public.voice_transcripts WHERE org_id_first = p_org;
  DELETE FROM public.signup_requests WHERE created_org_id = p_org;

  -- Cascade-delete org (remaining child tables handled by ON DELETE CASCADE)
  DELETE FROM public.organizations WHERE id = p_org;

  -- Re-arm audit-log protection
  PERFORM set_config('app.allow_audit_delete', 'false', true);

  RETURN jsonb_build_object('ok', true, 'deleted', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_org(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.delete_org(uuid, text) IS
  'Unified org deletion: authorizes, audits, purges audit trail, deletes members/projects explicitly, then cascades. DPDP-ready.';

COMMIT;
