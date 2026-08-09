-- SiteTrack Pro — V6 Phase 1.4: Payment Timeline + Notifications.
-- Adds payment_events table for chronological log of payment + status changes.
-- Also adds payment notification kinds to notifications table.

BEGIN;

-- 1. payment_events table for chronological log
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('invoice', 'ra_bill')),
  target_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('payment_received', 'status_changed', 'payment_method_updated', 'reference_updated')),
  description text NOT NULL,
  amount numeric(14,2),
  method text,
  reference text,
  old_status text,
  new_status text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_target ON public.payment_events(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_project ON public.payment_events(project_id, created_at DESC);

-- RLS: project members can read payment events for their projects
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_read ON public.payment_events;
CREATE POLICY payment_events_read ON public.payment_events FOR SELECT
  USING (
    project_id IN (SELECT public.user_project_ids())
  );

-- Write: only via RPC/triggers (not direct user insert)
GRANT SELECT ON public.payment_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM authenticated;

-- 2. Add payment notification kinds to notifications table
-- (Notifications table already exists from migration 89, just need to ensure kinds are allowed)
-- The notifications table already has a kind text field - we just need to ensure RLS allows new kinds
-- No schema change needed, just documentation of new kinds:
-- 'payment_received', 'payment_overdue', 'invoice_paid', 'ra_bill_paid', 'payment_overdue'

-- 3. Helper function to log payment events
CREATE OR REPLACE FUNCTION public.log_payment_event(
  p_project_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_kind text,
  p_description text,
  p_amount numeric DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_old_status text DEFAULT NULL,
  p_new_status text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.payment_events (
    project_id, target_type, target_id, kind, description,
    amount, method, reference, old_status, new_status, created_by
  ) VALUES (
    p_project_id, p_target_type, p_target_id, p_kind, p_description,
    p_amount, p_method, p_reference, p_old_status, p_new_status, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.log_payment_event(uuid, text, uuid, text, text, numeric, text, text, text, text) TO authenticated;

-- 4. Trigger to auto-log payment received events
CREATE OR REPLACE FUNCTION public.trigger_log_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_payment_event(
      NEW.project_id,
      NEW.target_type,
      NEW.target_id,
      'payment_received',
      'Payment received: ' || NEW.method || ' - ' || NEW.amount,
      NEW.amount,
      NEW.method,
      NEW.reference,
      NULL,
      NULL
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_payment_received ON public.payments;
CREATE TRIGGER trigger_payment_received
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trigger_log_payment_received();

-- 5. Trigger to auto-log invoice/RA bill status changes
CREATE OR REPLACE FUNCTION public.trigger_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DECLARE
      v_target_type text;
      v_target_id uuid;
      v_project_id uuid;
    BEGIN
      IF TG_TABLE_NAME = 'invoices' THEN
        v_target_type := 'invoice';
        v_target_id := NEW.id;
        v_project_id := NEW.project_id;
      ELSIF TG_TABLE_NAME = 'ra_bills' THEN
        v_target_type := 'ra_bill';
        v_target_id := NEW.id;
        v_project_id := NEW.project_id;
      ELSE
        RETURN NEW;
      END IF;
      PERFORM public.log_payment_event(
        v_project_id,
        v_target_type,
        v_target_id,
        'status_changed',
        'Status changed from ' || OLD.status || ' to ' || NEW.status,
        NULL, NULL, NULL,
        OLD.status,
        NEW.status
      );
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_invoice_status_change ON public.invoices;
CREATE TRIGGER trigger_invoice_status_change
AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trigger_log_status_change();

DROP TRIGGER IF EXISTS trigger_ra_bill_status_change ON public.ra_bills;
CREATE TRIGGER trigger_ra_bill_status_change
AFTER UPDATE ON public.ra_bills
FOR EACH ROW EXECUTE FUNCTION public.trigger_log_status_change();

COMMIT;