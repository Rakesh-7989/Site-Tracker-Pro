-- SiteTrack Pro — cross-project purchase orders RPC (2026-06-06).
-- Every PO across an org's projects, with project + vendor names, for the
-- /pos procurement view. SECURITY DEFINER, member-gated. Read-only. IDEMPOTENT.
--
-- v4 Phase E (158): the org_purchase_orders RPC was recreated with an extended
-- return type (added vendor_id/quote_id/quote_item + received/open amounts).
-- CREATE OR REPLACE cannot change a function's return type, so this legacy
-- definition must only be (re)created when NO single-arg org_purchase_orders
-- exists yet (fresh install). On live DBs 158 already owns the extended
-- signature — we skip here and let 158 rebuild it.

BEGIN;

DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'org_purchase_orders' AND pronargs = 1
  ) THEN
    EXECUTE format($fn$
      CREATE OR REPLACE FUNCTION public.org_purchase_orders(p_org uuid)
      RETURNS TABLE (
        id uuid, po_no text, project_id uuid, project_name text, vendor_name text,
        items text, amount bigint, status text, created_date date, delivery_date date
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT po.id, po.po_no, po.project_id, p.name, v.name,
               po.items, po.amount, po.status, po.created_date, po.delivery_date
        FROM public.purchase_orders po
        JOIN public.projects p ON p.id = po.project_id
        LEFT JOIN public.vendors v ON v.id = po.vendor_id
        WHERE (public.is_superadmin() OR p.org_id = ANY(public.user_org_ids()))
        ORDER BY po.created_date DESC NULLS LAST;
      $$;
    $fn$);
  END IF;
END
$outer$;

GRANT EXECUTE ON FUNCTION public.org_purchase_orders(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_purchase_orders(uuid) IS 'All POs across an org''s projects (+ project/vendor names). Empty for non-members. Extended return type maintained by migration 158.';

COMMIT;
