-- SiteTrack Pro — V6 Phase 1.5: Payment Notifications.
-- Adds notification creation for payment events and overdue alerts.

BEGIN;

-- 1. Helper function to create payment notifications
CREATE OR REPLACE FUNCTION public.create_payment_notification(
  p_user_id uuid,
  p_project_id uuid,
  p_org_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id, project_id, org_id, kind, title, body, link
  ) VALUES (
    p_user_id, p_project_id, p_org_id, p_kind, p_title, p_body, p_link
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_payment_notification(uuid, uuid, uuid, text, text, text, text) TO authenticated;

-- 2. Function to notify relevant users when payment is received
CREATE OR REPLACE FUNCTION public.notify_payment_received(
  p_project_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_recipients uuid[];
  v_user_id uuid;
BEGIN
  -- Get org_id from project
  SELECT org_id INTO v_org_id FROM public.projects WHERE id = p_project_id;
  
  -- Get project admins/managers who should be notified
  SELECT array_agg(DISTINCT om.profile_id)
  INTO v_recipients
  FROM public.org_members om
  JOIN public.project_members pm ON pm.profile_id = om.profile_id
  WHERE om.org_id = v_org_id
    AND pm.project_id = p_project_id
    AND om.status = 'active'
    AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head')
         OR pm.role IN ('pm', 'project_admin', 'project_head'));
  
  -- Also include the creator of the invoice/RA bill
  IF p_target_type = 'invoice' THEN
    SELECT array_append(v_recipients, created_by) INTO v_recipients
    FROM public.invoices WHERE id = p_target_id;
  ELSIF p_target_type = 'ra_bill' THEN
    SELECT array_append(v_recipients, created_by) INTO v_recipients
    FROM public.ra_bills WHERE id = p_target_id;
  END IF;
  
  -- Send notification to each recipient
  FOREACH v_user_id IN ARRAY v_recipients LOOP
    PERFORM public.create_payment_notification(
      v_user_id,
      p_project_id,
      v_org_id,
      'payment_received',
      'Payment Received',
      'Payment of ₹' || p_amount || ' received via ' || p_method || (CASE WHEN p_reference IS NOT NULL THEN ' (' || p_reference || ')' ELSE '' END),
      '/projects/' || p_project_id || '/' || p_target_type || 's/' || p_target_id
    );
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.notify_payment_received(uuid, text, uuid, numeric, text, text) TO authenticated;

-- 3. Function to notify on invoice/RA bill status change
CREATE OR REPLACE FUNCTION public.notify_status_changed(
  p_project_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_old_status text,
  p_new_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_recipients uuid[];
  v_user_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.projects WHERE id = p_project_id;
  
  SELECT array_agg(DISTINCT om.profile_id)
  INTO v_recipients
  FROM public.org_members om
  JOIN public.project_members pm ON pm.profile_id = om.profile_id
  WHERE om.org_id = v_org_id
    AND pm.project_id = p_project_id
    AND om.status = 'active'
    AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head')
         OR pm.role IN ('pm', 'project_admin', 'project_head'));
  
  FOREACH v_user_id IN ARRAY v_recipients LOOP
    PERFORM public.create_payment_notification(
      v_user_id,
      p_project_id,
      v_org_id,
      'status_changed',
      'Status Changed',
      p_target_type || ' status changed from ' || p_old_status || ' to ' || p_new_status,
      '/projects/' || p_project_id || '/' || p_target_type || 's/' || p_target_id
    );
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.notify_status_changed(uuid, text, uuid, text, text) TO authenticated;

-- 4. Function to check and notify overdue invoices/RA bills
CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_recipients uuid[];
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  -- Check overdue invoices (status = 'sent' or 'partial' and due_date < now())
  FOR v_rec IN
    SELECT i.id, i.project_id, i.due_date, i.amount, i.gst, i.tds, p.org_id
    FROM public.invoices i
    JOIN public.projects p ON p.id = i.project_id
    WHERE i.status IN ('sent', 'partial')
      AND i.due_date IS NOT NULL
      AND i.due_date < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.kind = 'payment_overdue'
          AND n.link = '/projects/' || i.project_id || '/invoices/' || i.id
          AND n.created_at > now() - interval '7 days'
      )
  LOOP
    SELECT array_agg(DISTINCT om.profile_id)
    INTO v_recipients
    FROM public.org_members om
    JOIN public.project_members pm ON pm.profile_id = om.profile_id
    WHERE om.org_id = v_rec.org_id
      AND pm.project_id = v_rec.project_id
      AND om.status = 'active'
      AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head')
           OR pm.role IN ('pm', 'project_admin', 'project_head'));
    
    FOREACH v_user_id IN ARRAY v_recipients LOOP
      PERFORM public.create_payment_notification(
        v_user_id,
        v_rec.project_id,
        v_rec.org_id,
        'payment_overdue',
        'Invoice Overdue',
        'Invoice of ₹' || (v_rec.amount + ROUND(v_rec.amount * COALESCE(v_rec.gst,0)/100) - ROUND(v_rec.amount * COALESCE(v_rec.tds,0)/100)) || ' is overdue since ' || to_char(v_rec.due_date, 'DD Mon YYYY'),
        '/projects/' || v_rec.project_id || '/invoices/' || v_rec.id
      );
    END LOOP;
  END LOOP;
  
  -- Check overdue RA bills
  FOR v_rec IN
    SELECT r.id, r.project_id, r.due_date, r.bill_amount, r.retention_pct, p.org_id
    FROM public.ra_bills r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.status IN ('submitted', 'approved')
      AND r.due_date IS NOT NULL
      AND r.due_date < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.kind = 'payment_overdue'
          AND n.link = '/projects/' || r.project_id || '/ra-bills/' || r.id
          AND n.created_at > now() - interval '7 days'
      )
  LOOP
    SELECT array_agg(DISTINCT om.profile_id)
    INTO v_recipients
    FROM public.org_members om
    JOIN public.project_members pm ON pm.profile_id = om.profile_id
    WHERE om.org_id = v_rec.org_id
      AND pm.project_id = v_rec.project_id
      AND om.status = 'active'
      AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head')
           OR pm.role IN ('pm', 'project_admin', 'project_head'));
    
    FOREACH v_user_id IN ARRAY v_recipients LOOP
      PERFORM public.create_payment_notification(
        v_user_id,
        v_rec.project_id,
        v_rec.org_id,
        'payment_overdue',
        'RA Bill Overdue',
        'RA Bill of ₹' || ROUND(v_rec.bill_amount * (1 - COALESCE(v_rec.retention_pct,0)/100)) || ' is overdue since ' || to_char(v_rec.due_date, 'DD Mon YYYY'),
        '/projects/' || v_rec.project_id || '/ra-bills/' || v_rec.id
      );
    END LOOP;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.check_overdue_payments() TO authenticated;

-- 5. Update the payment_received trigger to also send notifications
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
    -- Also send notifications
    PERFORM public.notify_payment_received(
      NEW.project_id,
      NEW.target_type,
      NEW.target_id,
      NEW.amount,
      NEW.method,
      NEW.reference
    );
  END IF;
  RETURN NEW;
END $$;

-- 6. Update the status_change trigger to also send notifications
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
      -- Also send notifications
      PERFORM public.notify_status_changed(
        v_project_id,
        v_target_type,
        v_target_id,
        OLD.status,
        NEW.status
      );
    END;
  END IF;
  RETURN NEW;
END $$;

COMMIT;