-- 218_po_approval_sod.sql
-- SEC-06 Vendor permissions + SEC-07 Approval SoD (end-to-end plan 1.3).
--
--   a) purchase_orders gains requested_by / approved_by / approved_at so every
--      PO approval is recorded and verifiable. requested_by is force-stamped to
--      auth.uid() on INSERT (spoof-proof for authenticated writers).
--   b) Vendor PO access is narrowed: the over-broad v4_vendor_read_pos policy
--      (vendor + project membership = read ALL POs on the project) is dropped —
--      vendors keep po_vendor_read (own vendor_id, org-scoped, migration 174).
--      v4_pos_insert loses its vendor branch (vendors submit quotes via
--      procurement_quotes; POs are raised by project PMs / superadmin only).
--   c) procurement_quotes_insert vendor branch now requires vendor_id to be the
--      caller's OWN vendor row (a vendor can no longer submit a quote under
--      another vendor's name).
--   d) guard_approval_status_update enforces approver != requester for PO and
--      change_order (SoD) and stamps approved_by/approved_at on PO approval
--      (change_order already stamped; approver id is now coerced to auth.uid()
--      for authenticated writers to prevent spoofed approver ids).
--   e) org_purchase_orders() recreated with requested_by/approved_by/approved_at
--      (+ name joins) so the org-wide rollup can verify approvals.
--
-- Safe to re-run. Follows 110 (trigger function) + 126 (PO policies) + 153
-- (procurement_quotes) + 158 (org_purchase_orders) + 174 (po_vendor_read).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. purchase_orders approval columns + force-stamped requester
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz;

COMMENT ON COLUMN public.purchase_orders.requested_by IS
  'Profile that raised the PO (force-stamped to auth.uid() on insert). SoD: cannot approve own PO.';
COMMENT ON COLUMN public.purchase_orders.approved_by IS
  'Profile that approved the PO (stamped by guard_approval_status_update on status -> approved).';
COMMENT ON COLUMN public.purchase_orders.approved_at IS
  'When the PO was approved (stamped by guard_approval_status_update).';

-- Force-stamp the requester so a client can never set requested_by to someone
-- else's id (defeats the SoD check). service_role (auth.uid() IS NULL) keeps an
-- explicitly provided value for EF/server-side inserts.
CREATE OR REPLACE FUNCTION public.po_stamp_requested_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  new.requested_by := coalesce(auth.uid(), new.requested_by);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_stamp_requested_by ON public.purchase_orders;
CREATE TRIGGER trg_po_stamp_requested_by
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.po_stamp_requested_by();

-- ---------------------------------------------------------------------------
-- 2. Vendor permissions (SEC-06): narrow vendor PO access
-- ---------------------------------------------------------------------------
-- Vendors read ONLY their own POs via po_vendor_read (migration 174). The
-- vendor + project-membership policy leaked every PO on the project to any
-- vendor who could hold a project_members row (e.g. contractor masquerading).
DROP POLICY IF EXISTS v4_vendor_read_pos ON public.purchase_orders;

-- POs are raised by project PMs (po:create) or superadmin. The vendor INSERT
-- branch is removed — vendors submit quotes (procurement_quotes), they do not
-- create purchase_orders.
DROP POLICY IF EXISTS v4_pos_insert ON public.purchase_orders;
CREATE POLICY v4_pos_insert ON public.purchase_orders FOR INSERT
  WITH CHECK (
    (public.is_role_in('pm') AND project_id IN (SELECT public.user_project_ids()))
    OR public.is_superadmin()
  );

-- A vendor may only submit a quote under their OWN vendor row (no more spoofing
-- another vendor's quote / sabotaging the quote comparison). Manager insert
-- (orgadmin / pm / project_admin / design_head / consultant_head / superadmin)
-- keeps free vendor_id choice for manual quote entry.
DROP POLICY IF EXISTS procurement_quotes_insert ON public.procurement_quotes;
CREATE POLICY procurement_quotes_insert ON public.procurement_quotes FOR INSERT
  WITH CHECK (
    org_id = any(public.user_org_ids())
    and (
      (
        public.has_org_tier(org_id, 'vendor')
        and vendor_id in (
          select id from public.vendors
          where profile_id = auth.uid()
            and org_id = any(public.user_org_ids())
        )
      )
      or is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Approval SoD (SEC-07): approver != requester + verifiable PO approvals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_approval_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_resource text := tg_argv[0];
begin
  if old.status is distinct from new.status then
    if not public.can_approve_project_status(new.project_id, v_resource) then
      raise exception 'approval status change for % requires an approver role', v_resource
        using errcode = '42501';
    end if;

    if v_resource = 'purchase_order' then
      if new.status = 'approved' then
        if auth.uid() is not null and new.requested_by = auth.uid() then
          raise exception 'requester cannot approve their own purchase order'
            using errcode = '42501';
        end if;
        new.approved_by := coalesce(auth.uid(), new.approved_by);
        new.approved_at := coalesce(new.approved_at, now());
      end if;
    end if;

    if v_resource = 'change_order' then
      if new.status = 'approved' then
        if auth.uid() is not null and new.raised_by = auth.uid() then
          raise exception 'requester cannot approve their own change order'
            using errcode = '42501';
        end if;
        new.approved_by := coalesce(auth.uid(), new.approved_by);
        new.approved_at := coalesce(new.approved_at, now());
      end if;
    end if;
  end if;

  if v_resource = 'ra_bill' then
    if old.paid_amount is distinct from new.paid_amount then
      if not public.can_approve_project_status(new.project_id, v_resource) then
        raise exception 'paid amount change for % requires an approver role', v_resource
          using errcode = '42501';
      end if;
    end if;
  end if;

  if v_resource = 'invoice' then
    if old.paid_date is distinct from new.paid_date then
      if not public.can_approve_project_status(new.project_id, v_resource) then
        raise exception 'paid date change for % requires an approver role', v_resource
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Org-wide rollup carries the approval trail
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.org_purchase_orders(uuid);
CREATE FUNCTION public.org_purchase_orders(p_org uuid)
RETURNS TABLE (
  id uuid, po_no text, project_id uuid, project_name text, vendor_name text,
  items text, amount bigint, status text, created_date date, delivery_date date,
  vendor_id uuid, quote_id uuid, quote_item text,
  received_amount bigint, open_amount bigint,
  requested_by uuid, requested_by_name text,
  approved_by uuid, approved_by_name text, approved_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT po.id, po.po_no, po.project_id, p.name, v.name,
         po.items, po.amount, po.status, po.created_date, po.delivery_date,
         po.vendor_id, po.quote_id, q.item_name,
         COALESCE(r.received, 0) AS received_amount,
         GREATEST(0, po.amount - COALESCE(r.received, 0)) AS open_amount,
         po.requested_by, req.name,
         po.approved_by, ap.name, po.approved_at
  FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  LEFT JOIN public.vendors v ON v.id = po.vendor_id
  LEFT JOIN public.procurement_quotes q ON q.id = po.quote_id
  LEFT JOIN public.profiles req ON req.id = po.requested_by
  LEFT JOIN public.profiles ap ON ap.id = po.approved_by
  LEFT JOIN (
    SELECT po_id, sum(amount) AS received
    FROM public.po_receipts GROUP BY po_id
  ) r ON r.po_id = po.id
  WHERE p.org_id = p_org
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  ORDER BY po.created_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.org_purchase_orders(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_purchase_orders(uuid) IS
  'All POs across an org''s projects with received/open settlement amounts and the approval trail (requested_by/approved_by/approved_at). Empty for non-members.';

GRANT SELECT, INSERT, UPDATE ON public.purchase_orders TO authenticated;
GRANT SELECT, INSERT ON public.procurement_quotes TO authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.purchase_orders;
  RAISE NOTICE '218_po_approval_sod: purchase_orders_rows=%', n;
END $$;

COMMIT;