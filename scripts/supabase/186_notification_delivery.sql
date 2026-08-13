-- SiteTrack Pro — B4: Notification Delivery Pipeline.
-- Connects in-app notifications table → Edge Function delivery (email/WhatsApp/push).
-- Adds user notification preferences + trigger to call notify-deliver EF.

BEGIN;

-- 1. Add notification_prefs to profiles (referenced by notify-deliver EF)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.notification_prefs IS
  'Per-kind channel preferences: { "payment_received": { "push": true, "email": false, "whatsapp": true } }';

-- 2. Trigger function to invoke notify-deliver Edge Function on notification insert
CREATE OR REPLACE FUNCTION public.trigger_notify_deliver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_resp text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Build payload for notify-deliver EF
    v_payload := jsonb_build_object(
      'id', NEW.id
    );

    -- Call notify-deliver via net.http_post (requires supabase.net_http extension)
    -- Idempotent: notify-deliver checks delivered_at and no-ops if already set
    PERFORM net.http_post(
      url := current_setting('app.notify_deliver_url', true),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Token', current_setting('app.notify_internal_token', true)
      ),
      body := v_payload,
      timeout_milliseconds := 5000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fail silently: don't block notification creation if delivery EF is down
  RAISE NOTICE 'notify-deliver trigger failed: %', SQLERRM;
  RETURN NEW;
END $$;

-- 3. Attach trigger to notifications table
DROP TRIGGER IF EXISTS trg_notify_deliver ON public.notifications;
CREATE TRIGGER trg_notify_deliver
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_deliver();

-- 4. Grant execute on trigger function
GRANT EXECUTE ON FUNCTION public.trigger_notify_deliver() TO authenticated;

-- 5. Add WhatsApp template mapping for triggers (stored in notification_rules metadata)
-- We'll store template_name per trigger in a new column
ALTER TABLE public.notification_rules
  ADD COLUMN IF NOT EXISTS template_name text;

-- 6. Backfill template_name for existing triggers (idempotent)
UPDATE public.notification_rules SET template_name = trigger || '_en'
WHERE template_name IS NULL;

-- 7. Add email template subject/body mapping table (optional, for Resend)
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  template_name text,          -- WhatsApp template name (for whatsapp channel)
  subject text,                -- Email subject (for email channel)
  body text,                   -- Email body template (for email channel) - supports {{vars}}
  language text DEFAULT 'en',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (trigger, channel, language)
);

-- Seed default templates (English)
INSERT INTO public.notification_templates (trigger, channel, template_name, subject, body, language)
VALUES
  ('high_issue', 'whatsapp', 'high_issue_en', NULL, NULL, 'en'),
  ('high_issue', 'email', NULL, 'HIGH Severity Issue: {{title}}', '<p>A HIGH severity issue was opened: <strong>{{title}}</strong></p><p>{{body}}</p><p><a href="{{link}}">View in SiteTrack</a></p>', 'en'),
  ('ra_bill_submitted', 'whatsapp', 'ra_bill_submitted_en', NULL, NULL, 'en'),
  ('ra_bill_submitted', 'email', NULL, 'RA Bill Submitted: {{title}}', '<p>RA Bill <strong>{{title}}</strong> was submitted for review.</p><p><a href="{{link}}">View in SiteTrack</a></p>', 'en'),
  ('change_order_pending', 'whatsapp', 'change_order_pending_en', NULL, NULL, 'en'),
  ('change_order_pending', 'email', NULL, 'Change Order Awaiting Approval: {{title}}', '<p>Change Order <strong>{{title}}</strong> is awaiting your approval.</p><p><a href="{{link}}">View in SiteTrack</a></p>', 'en'),
  ('milestone_overdue', 'whatsapp', 'milestone_overdue_en', NULL, NULL, 'en'),
  ('milestone_overdue', 'email', NULL, 'Milestone Overdue: {{title}}', '<p>Milestone <strong>{{title}}</strong> is overdue since {{due_date}}.</p><p><a href="{{link}}">View in SiteTrack</a></p>', 'en'),
  ('drawing_release', 'whatsapp', 'drawing_release_en', NULL, NULL, 'en'),
  ('drawing_release', 'email', NULL, 'Drawing Released: {{title}}', '<p>Drawing <strong>{{title}}</strong> has been released.</p><p><a href="{{link}}">View in SiteTrack</a></p>', 'en'),
  ('rfi_overdue', 'whatsapp', 'rfi_overdue_en', NULL, NULL, 'en'),
  ('rfi_overdue', 'email', NULL, 'RFI Unanswered > 3 Days: {{title}}', '<p>RFI <strong>{{title}}</strong> has been unanswered for over 3 days.</p><p><a href="{{link}}">View in SiteTrack</a></p>', 'en'),
  ('invoice_overdue', 'whatsapp', 'invoice_overdue_en', NULL, NULL, 'en'),
  ('invoice_overdue', 'email', NULL, 'Invoice Overdue: {{title}}', '<p>Invoice <strong>{{title}}</strong> is overdue.</p><p><a href="{{link}}">View in SiteTrack</a></p>', 'en')
ON CONFLICT (trigger, channel, language) DO NOTHING;

-- 8. Add RLS for notification_templates
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_templates_read ON public.notification_templates;
CREATE POLICY notification_templates_read ON public.notification_templates FOR SELECT
USING (true);  -- Public read for templates

DROP POLICY IF EXISTS notification_templates_write ON public.notification_templates;
CREATE POLICY notification_templates_write ON public.notification_templates FOR ALL
USING (is_superadmin())
WITH CHECK (is_superadmin());

GRANT SELECT ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;

-- 9. Verification notice
DO $$ DECLARE
  c1 int; c2 int; c3 int; c4 int;
BEGIN
  SELECT count(*) INTO c1 FROM public.profiles WHERE notification_prefs IS NOT NULL;
  SELECT count(*) INTO c2 FROM public.notification_rules;
  SELECT count(*) INTO c3 FROM public.notification_templates;
  SELECT count(*) INTO c4 FROM information_schema.triggers WHERE trigger_name = 'trg_notify_deliver';
  RAISE NOTICE '186_notification_delivery: profiles with prefs=%, notification_rules=%, templates=%, trg_notify_deliver=%', c1, c2, c3, c4;
END $$;

COMMIT;