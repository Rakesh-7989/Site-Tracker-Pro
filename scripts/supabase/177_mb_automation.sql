-- SiteTrack Pro — V6 Phase 3: MB Automation.
-- Auto-link MB on status change, scheduled recalc, retention release workflow.

BEGIN;

-- 1. Auto-link unlinked MB entries when RA bill is approved
CREATE OR REPLACE FUNCTION public.auto_link_mb_on_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved' THEN
    -- Auto-link all verified but unlinked MB entries for this project
    UPDATE public.measurement_book
    SET ra_bill_id = NEW.id
    WHERE project_id = NEW.project_id
      AND ra_bill_id IS NULL
      AND status = 'verified';
    GET DIAGNOSTICS v_linked = ROW_COUNT;
    
    -- Log the auto-link action
    PERFORM public.record_audit_v2(
      'UPDATE', 'ra_bills', NEW.id::text,
      NEW.project_id,
      to_jsonb(OLD), to_jsonb(NEW),
      format('Auto-linked %s verified MB entries on approval', v_linked)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_link_mb ON public.ra_bills;
CREATE TRIGGER trg_auto_link_mb
AFTER UPDATE ON public.ra_bills
FOR EACH ROW EXECUTE FUNCTION public.auto_link_mb_on_approve();

-- 2. Scheduled recalculation of all approved/paid RA bills from linked MB
CREATE OR REPLACE FUNCTION public.recalc_all_ra_bills_from_mb()
RETURNS table(ra_bill_id uuid, old_amount bigint, new_amount numeric, delta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT r.id, r.bill_amount,
           COALESCE(m.total_amount, 0) AS mb_total
    FROM public.ra_bills r
    LEFT JOIN LATERAL (
      SELECT total_amount FROM public.sum_mb_for_ra(r.id)
    ) m ON true
    WHERE r.status IN ('approved', 'paid')
      AND m.total_amount IS NOT NULL
      AND r.bill_amount <> ROUND(m.total_amount)
  LOOP
    UPDATE public.ra_bills
    SET bill_amount = ROUND(v_rec.mb_total),
        cumulative = ROUND(v_rec.mb_total)
    WHERE id = v_rec.id;
    
    PERFORM public.record_audit_v2(
      'UPDATE', 'ra_bills', v_rec.id::text,
      (SELECT project_id FROM public.ra_bills WHERE id = v_rec.id),
      to_jsonb(jsonb_build_object('bill_amount', v_rec.bill_amount)),
      to_jsonb(jsonb_build_object('bill_amount', ROUND(v_rec.mb_total))),
      'Scheduled recalc from linked MB entries'
    );
    
    RETURN NEXT;
  END LOOP;
  RETURN;
END $$;

GRANT EXECUTE ON FUNCTION public.recalc_all_ra_bills_from_mb() TO authenticated;

-- 3. Retention release workflow: mark retention released, update paid_amount
ALTER TABLE public.ra_bills
ADD COLUMN IF NOT EXISTS retention_released boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS retention_released_at timestamptz,
ADD COLUMN IF NOT EXISTS retention_released_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.release_ra_retention(p_ra_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_retention_amt numeric;
BEGIN
  SELECT * INTO v_bill FROM public.ra_bills WHERE id = p_ra_bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RA bill % not found', p_ra_bill_id;
  END IF;
  
  IF v_bill.status <> 'paid' THEN
    RAISE EXCEPTION 'Retention can only be released for paid RA bills (current: %)', v_bill.status;
  END IF;
  
  IF v_bill.retention_released THEN
    RAISE EXCEPTION 'Retention already released for RA bill %', p_ra_bill_id;
  END IF;
  
  v_retention_amt := ROUND(v_bill.bill_amount * v_bill.retention_pct / 100);
  
  UPDATE public.ra_bills
  SET retention_released = true,
      retention_released_at = now(),
      retention_released_by = auth.uid(),
      paid_amount = bill_amount  -- full amount now paid
  WHERE id = p_ra_bill_id;
  
  PERFORM public.record_audit_v2(
    'UPDATE', 'ra_bills', p_ra_bill_id::text,
    v_bill.project_id,
    to_jsonb(jsonb_build_object('retention_released', false, 'paid_amount', v_bill.paid_amount)),
    to_jsonb(jsonb_build_object('retention_released', true, 'paid_amount', v_bill.bill_amount)),
    format('Retention of %s released (retention % = %s%%)', v_retention_amt, v_bill.retention_pct)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.release_ra_retention(uuid) TO authenticated;

-- 4. Cron job for scheduled recalc (daily at 3 AM IST)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recalc-ra-bills-from-mb') THEN
    PERFORM cron.unschedule('recalc-ra-bills-from-mb');
  END IF;
END $$;
SELECT cron.schedule(
  'recalc-ra-bills-from-mb',
  '30 21 * * *',  -- 21:30 UTC = 03:00 IST
  $$SELECT public.recalc_all_ra_bills_from_mb()$$
);

COMMIT;