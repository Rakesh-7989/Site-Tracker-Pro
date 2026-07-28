-- SiteTrack Pro — organisation deletion (DPDP right-to-erasure, 2026-06-06).
--
-- NOW A WRAPPER around delete_org(uuid, text). The canonical implementation
-- lives in migration 122 (unified_org_deletion.sql).
--
-- IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_organization(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.delete_org(p_org, 'DPDP erasure');
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_organization(uuid) TO authenticated;
COMMENT ON FUNCTION public.delete_organization(uuid) IS
  'DEPRECATED — delegates to delete_org(uuid, text). DPDP erasure: deletes an org + all its data.';

COMMIT;
