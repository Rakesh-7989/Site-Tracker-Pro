-- SiteTrack Pro — organisation deletion (DPDP right-to-erasure, 2026-06-06).
-- A SECURITY DEFINER RPC that deletes an org and ALL its data (via ON DELETE
-- CASCADE on org_id/project_id FKs). Gated to a superadmin or an admin of that
-- org. IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_organization(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NOT (public.is_superadmin() OR public.has_org_tier(p_org, 'admin')) THEN
    RAISE EXCEPTION 'not authorized to delete this organization';
  END IF;
  SELECT name INTO v_name FROM public.organizations WHERE id = p_org;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization not found');
  END IF;
  -- Purge audit trail for DPDP erasure before cascade delete (audit log is immutable otherwise)
  PERFORM set_config('app.allow_audit_delete', 'true', true);
  DELETE FROM public.audit_log_v2 WHERE org_id = p_org;
  PERFORM set_config('app.allow_audit_delete', 'false', true);

  -- Cascades to remaining child data (audit_log_v2 rows already gone)
  DELETE FROM public.organizations WHERE id = p_org;
  RETURN jsonb_build_object('ok', true, 'deleted', v_name);
END $$;

GRANT EXECUTE ON FUNCTION public.delete_organization(uuid) TO authenticated;
COMMENT ON FUNCTION public.delete_organization(uuid) IS
  'DPDP erasure: deletes an org + all its data (cascade). Caller must be superadmin or an admin of the org.';

COMMIT;
