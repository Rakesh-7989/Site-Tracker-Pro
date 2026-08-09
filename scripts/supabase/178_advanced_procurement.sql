-- SiteTrack Pro — v6 Phase 5: Advanced Procurement (3-way matching, vendor scorecards, automation).
-- Extends the PO→GRN chain through to invoice matching and adds vendor performance tracking.

BEGIN;

-- 1. Enhance po_receipts with 3-way matching fields
ALTER TABLE public.po_receipts
ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS match_status text DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'partial', 'disputed')),
ADD COLUMN IF NOT EXISTS matched_amount bigint DEFAULT 0 CHECK (matched_amount >= 0),
ADD COLUMN IF NOT EXISTS matched_at timestamptz,
ADD COLUMN IF NOT EXISTS matched_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for matching lookups
CREATE INDEX IF NOT EXISTS idx_po_receipts_invoice ON public.po_receipts(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_receipts_match_status ON public.po_receipts(match_status);

-- 2. Vendor performance tracking table
CREATE TABLE IF NOT EXISTS public.vendor_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  
  -- Delivery metrics
  total_pos int DEFAULT 0,
  on_time_deliveries int DEFAULT 0,
  late_deliveries int DEFAULT 0,
  partial_deliveries int DEFAULT 0,
  total_qty_ordered int DEFAULT 0,
  total_qty_delivered int DEFAULT 0,
  total_qty_rejected int DEFAULT 0,
  
  -- Quality metrics
  quality_issues int DEFAULT 0,
  returns_count int DEFAULT 0,
  dispute_count int DEFAULT 0,
  
  -- Financial metrics
  total_amount_ordered bigint DEFAULT 0,
  total_amount_delivered bigint DEFAULT 0,
  total_amount_invoiced bigint DEFAULT 0,
  avg_payment_days numeric(6,2),
  
  -- Computed scores (0-100)
  delivery_score numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_pos > 0 
      THEN ROUND((on_time_deliveries::numeric / total_pos) * 100, 2)
      ELSE 0 END
  ) STORED,
  quality_score numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_qty_delivered > 0
      THEN ROUND(GREATEST(0, 100 - (quality_issues::numeric / total_qty_delivered) * 100), 2)
      ELSE 100 END
  ) STORED,
  financial_score numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_amount_ordered > 0
      THEN ROUND((total_amount_delivered::numeric / total_amount_ordered) * 100, 2)
      ELSE 0 END
  ) STORED,
  overall_score numeric(5,2) GENERATED ALWAYS AS (
    ROUND((delivery_score * 0.4 + quality_score * 0.3 + financial_score * 0.3), 2)
  ) STORED,
  
  -- Rating (1-5, manual override)
  manual_rating numeric(2,1) CHECK (manual_rating IS NULL OR (manual_rating >= 1 AND manual_rating <= 5)),
  
  -- Timestamps
  period_start date NOT NULL,
  period_end date NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (vendor_id, org_id, project_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_vendor_performance_vendor ON public.vendor_performance(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_performance_org ON public.vendor_performance(org_id, period_start DESC);

ALTER TABLE public.vendor_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_perf_read ON public.vendor_performance;
CREATE POLICY vendor_perf_read ON public.vendor_performance FOR SELECT
  USING (
    org_id IN (SELECT public.user_org_ids())
  );

DROP POLICY IF EXISTS vendor_perf_write ON public.vendor_performance;
CREATE POLICY vendor_perf_write ON public.vendor_performance FOR INSERT
  WITH CHECK (
    public.is_superadmin() 
    OR org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS vendor_perf_update ON public.vendor_performance;
CREATE POLICY vendor_perf_update ON public.vendor_performance FOR UPDATE
  USING (
    public.is_superadmin() 
    OR org_id = public.user_org_id()
  )
  WITH CHECK (
    public.is_superadmin() 
    OR org_id = public.user_org_id()
  );

GRANT SELECT, INSERT, UPDATE ON public.vendor_performance TO authenticated;
REVOKE ALL ON public.vendor_performance FROM anon;

-- 3. 3-way matching helper function: match PO receipt to invoice
CREATE OR REPLACE FUNCTION public.match_po_receipt_to_invoice(
  p_receipt_id uuid,
  p_invoice_id uuid,
  p_matched_amount bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt RECORD;
  v_invoice RECORD;
  v_po RECORD;
BEGIN
  -- Fetch receipt
  SELECT * INTO v_receipt FROM public.po_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt % not found', p_receipt_id; END IF;
  
  -- Fetch invoice
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  
  -- Verify same project
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_receipt.po_id;
  IF v_po.project_id <> v_invoice.project_id THEN
    RAISE EXCEPTION 'Invoice and PO must belong to same project';
  END IF;
  
  -- Verify amount doesn't exceed receipt amount
  IF p_matched_amount > v_receipt.amount THEN
    RAISE EXCEPTION 'Matched amount (%) exceeds receipt amount (%)', p_matched_amount, v_receipt.amount;
  END IF;
  
  -- Check already matched amount
  IF (v_receipt.matched_amount + p_matched_amount) > v_receipt.amount THEN
    RAISE EXCEPTION 'Total matched would exceed receipt amount';
  END IF;
  
  -- Update receipt
  UPDATE public.po_receipts
  SET invoice_id = p_invoice_id,
      matched_amount = matched_amount + p_matched_amount,
      match_status = CASE 
        WHEN (matched_amount + p_matched_amount) >= amount THEN 'matched'
        WHEN (matched_amount + p_matched_amount) > 0 THEN 'partial'
        ELSE 'unmatched'
      END,
      matched_at = CASE 
        WHEN (matched_amount + p_matched_amount) >= amount THEN now()
        ELSE matched_at
      END,
      matched_by = auth.uid()
  WHERE id = p_receipt_id;
  
  -- Log audit
  PERFORM public.record_audit_v2(
    'UPDATE', 'po_receipts', p_receipt_id::text,
    v_po.project_id,
    to_jsonb(v_receipt), to_jsonb((SELECT * FROM public.po_receipts WHERE id = p_receipt_id)),
    format('3-way matched to invoice % for %', p_invoice_id, p_matched_amount)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.match_po_receipt_to_invoice(uuid, uuid, bigint) TO authenticated;

-- 4. Auto-compute vendor performance (called periodically or on events)
CREATE OR REPLACE FUNCTION public.recompute_vendor_performance(
  p_vendor_id uuid,
  p_org_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_period_start date,
  p_period_end date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_on_time int := 0;
  v_late int := 0;
  v_partial int := 0;
  v_total_pos int := 0;
  v_qty_ordered int := 0;
  v_qty_delivered int := 0;
  v_qty_rejected int := 0;
  v_quality_issues int := 0;
  v_returns int := 0;
  v_disputes int := 0;
  v_amt_ordered bigint := 0;
  v_amt_delivered bigint := 0;
  v_amt_invoiced bigint := 0;
  v_avg_payment numeric := 0;
BEGIN
  -- Count POs in period
  SELECT COUNT(*) INTO v_total_pos
  FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND po.created_date BETWEEN p_period_start AND p_period_end;
  
  -- Delivery timeliness (approved POs with delivery_date)
  SELECT COUNT(*) INTO v_on_time
  FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  LEFT JOIN public.po_receipts pr ON pr.po_id = po.id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND po.created_date BETWEEN p_period_start AND p_period_end
    AND po.status IN ('approved', 'delivered')
    AND pr.received_date IS NOT NULL
    AND (po.delivery_date IS NULL OR pr.received_date <= po.delivery_date);
  
  SELECT COUNT(*) INTO v_late
  FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  LEFT JOIN public.po_receipts pr ON pr.po_id = po.id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND po.created_date BETWEEN p_period_start AND p_period_end
    AND po.status IN ('approved', 'delivered')
    AND pr.received_date IS NOT NULL
    AND po.delivery_date IS NOT NULL
    AND pr.received_date > po.delivery_date;
  
  -- Partial deliveries
  SELECT COUNT(DISTINCT pr.po_id) INTO v_partial
  FROM public.po_receipts pr
  JOIN public.purchase_orders po ON po.id = pr.po_id
  JOIN public.projects p ON p.id = po.project_id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND pr.created_at BETWEEN p_period_start AND p_period_end
    AND pr.amount < (SELECT amount FROM public.purchase_orders WHERE id = pr.po_id);
  
  -- Quantities
  SELECT COALESCE(SUM(pr.qty), 0) INTO v_qty_delivered
  FROM public.po_receipts pr
  JOIN public.purchase_orders po ON po.id = pr.po_id
  JOIN public.projects p ON p.id = po.project_id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND pr.created_at BETWEEN p_period_start AND p_period_end;
  
  -- Quality issues (from disputes, returns)
  SELECT COUNT(*) INTO v_quality_issues
  FROM public.po_receipts pr
  JOIN public.purchase_orders po ON po.id = pr.po_id
  JOIN public.projects p ON p.id = po.project_id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND pr.created_at BETWEEN p_period_start AND p_period_end
    AND pr.match_status = 'disputed';
  
  -- Financial totals
  SELECT COALESCE(SUM(po.amount), 0) INTO v_amt_ordered
  FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND po.created_date BETWEEN p_period_start AND p_period_end;
  
  SELECT COALESCE(SUM(pr.amount), 0) INTO v_amt_delivered
  FROM public.po_receipts pr
  JOIN public.purchase_orders po ON po.id = pr.po_id
  JOIN public.projects p ON p.id = po.project_id
  WHERE po.vendor_id = p_vendor_id
    AND p.org_id = p_org_id
    AND (p_project_id IS NULL OR po.project_id = p_project_id)
    AND pr.created_at BETWEEN p_period_start AND p_period_end;
  
  -- Upsert vendor performance
  INSERT INTO public.vendor_performance (
    vendor_id, org_id, project_id,
    total_pos, on_time_deliveries, late_deliveries, partial_deliveries,
    total_qty_ordered, total_qty_delivered, total_qty_rejected,
    quality_issues, returns_count, dispute_count,
    total_amount_ordered, total_amount_delivered, total_amount_invoiced,
    period_start, period_end
  ) VALUES (
    p_vendor_id, p_org_id, p_project_id,
    v_total_pos, v_on_time, v_late, v_partial,
    v_qty_ordered, v_qty_delivered, v_qty_rejected,
    v_quality_issues, v_returns, v_disputes,
    v_amt_ordered, v_amt_delivered, v_amt_invoiced,
    p_period_start, p_period_end
  )
  ON CONFLICT (vendor_id, org_id, project_id, period_start, period_end) DO UPDATE SET
    total_pos = EXCLUDED.total_pos,
    on_time_deliveries = EXCLUDED.on_time_deliveries,
    late_deliveries = EXCLUDED.late_deliveries,
    partial_deliveries = EXCLUDED.partial_deliveries,
    total_qty_ordered = EXCLUDED.total_qty_ordered,
    total_qty_delivered = EXCLUDED.total_qty_delivered,
    total_qty_rejected = EXCLUDED.total_qty_rejected,
    quality_issues = EXCLUDED.quality_issues,
    returns_count = EXCLUDED.returns_count,
    dispute_count = EXCLUDED.dispute_count,
    total_amount_ordered = EXCLUDED.total_amount_ordered,
    total_amount_delivered = EXCLUDED.total_amount_delivered,
    total_amount_invoiced = EXCLUDED.total_amount_invoiced,
    computed_at = now();
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_vendor_performance(uuid, uuid, uuid, date, date) TO authenticated;

-- 5. Auto-match trigger: when invoice is created for a PO, try to match receipts
CREATE OR REPLACE FUNCTION public.auto_match_invoice_to_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipts uuid[];
  v_receipt RECORD;
  v_remaining bigint;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.source IN ('hourly', 'retainer', 'phase') THEN
    -- For vendor invoices (source = 'vendor' or if we add a vendor source), 
    -- we could auto-match. For now, this is a placeholder for future extension.
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

-- 6. Recompute all vendor performances for an org (for cron/manual run)
CREATE OR REPLACE FUNCTION public.recompute_all_vendor_performance(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor RECORD;
  v_period_start date := date_trunc('month', now() - interval '1 month')::date;
  v_period_end date := date_trunc('month', now())::date - 1;
BEGIN
  FOR v_vendor IN
    SELECT DISTINCT v.id, p.org_id, po.project_id
    FROM public.vendors v
    JOIN public.purchase_orders po ON po.vendor_id = v.id
    JOIN public.projects p ON p.id = po.project_id
    WHERE p.org_id = p_org_id
  LOOP
    PERFORM public.recompute_vendor_performance(
      v_vendor.id, v_vendor.org_id, v_vendor.project_id,
      v_period_start, v_period_end
    );
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_all_vendor_performance(uuid) TO authenticated;

-- 7. Cron job for monthly vendor performance recomputation (1st of month, 2 AM IST)
SELECT cron.unschedule('recompute-vendor-performance') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-vendor-performance');
SELECT cron.schedule(
  'recompute-vendor-performance',
  '30 20 1 * *',  -- 20:30 UTC = 02:00 IST on 1st of month
  $$SELECT public.recompute_all_vendor_performance( (SELECT org_id FROM public.organizations WHERE id = (SELECT org_id FROM public.projects LIMIT 1)) )$$
);

COMMIT;