-- SiteTrack Pro — vendors v3 bridge (2026-06-06).
-- Org-level vendor directory (material suppliers / subcontractors). GRANT +
-- additive v3 policies: read = any org member, write = org admin/pm (the UI
-- gates the precise vendor:manage capability). IDEMPOTENT.

BEGIN;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
REVOKE ALL ON public.vendors FROM anon;

DROP POLICY IF EXISTS v3_read_vendors  ON public.vendors;
DROP POLICY IF EXISTS v3_write_vendors ON public.vendors;
CREATE POLICY v3_read_vendors ON public.vendors FOR SELECT
  USING (public.is_superadmin() OR org_id = ANY(public.user_org_ids()));
CREATE POLICY v3_write_vendors ON public.vendors FOR ALL
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin', 'pm'))
  WITH CHECK (public.is_superadmin() OR public.has_org_tier(org_id, 'admin', 'pm'));

COMMIT;
