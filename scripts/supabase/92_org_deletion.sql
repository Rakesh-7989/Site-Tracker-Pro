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
  -- Cascades to projects → milestones/tasks/finance/etc, org_members, templates,
  -- approval_chains, notification_rules, org_integrations, subscriptions, org_roles…
  DELETE FROM public.organizations WHERE id = p_org;
  RETURN jsonb_build_object('ok', true, 'deleted', v_name);
END $$;

GRANT EXECUTE ON FUNCTION public.delete_organization(uuid) TO authenticated;
COMMENT ON FUNCTION public.delete_organization(uuid) IS
  'DPDP erasure: deletes an org + all its data (cascade). Caller must be superadmin or an admin of the org.';

COMMIT;
