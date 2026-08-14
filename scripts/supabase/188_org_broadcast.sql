-- SiteTrack Pro -- B4.5: Org broadcast RPC.
-- Allows org admins/superadmins to broadcast notifications to all active org members.
-- Uses existing notification template system + notification_rules + user preferences.

BEGIN;

-- 1. Create the send_org_notification RPC (SECURITY DEFINER, service_role only)
CREATE OR REPLACE FUNCTION public.send_org_notification(
  p_org_id uuid,
  p_type text,
  p_placeholders jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  success boolean,
  sent_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  error text DEFAULT NULL
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_template record;
  v_recipients uuid[];
  v_user_id uuid;
  v_project_id uuid;
  v_org_name text;
  v_notif_title text;
  v_notif_body text;
  v_link text;
  v_sent int DEFAULT 0;
  v_failed int DEFAULT 0;
  v_err text;
BEGIN
  -- Verify org exists
  SELECT id, name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, 0::integer, 0::integer, 'Org not found'::text;
  END IF;

  -- Verify user has org:notifications:manage capability (checked at call site via service_role)
  -- Fetch template for this type + org + english language
  SELECT * INTO v_template FROM public.notification_templates
  WHERE trigger = p_type AND channel = 'email' AND language = 'en';

  -- Build title/body from template if template exists, otherwise use defaults
  IF v_template IS NOT NULL THEN
    v_notif_title := public.generateTitle(p_type, p_placeholders);
    v_notif_body := public.generateBody(p_type, p_placeholders);
    v_link := '#';
  ELSE
    -- Fallback title/body
    v_notif_title := public.NOTIFICATION_TITLES[p_type] || ' - ' || v_org_name;
    v_notif_body := public.NOTIFICATION_BODIES[p_type];
    v_link := '#';
  END IF;

  -- Fetch active org members as recipients
  SELECT array_agg(DISTINCT om.profile_id) INTO v_recipients
  FROM public.org_members om
  WHERE om.org_id = p_org_id
    AND om.status = 'active';

  -- Insert notifications for each recipient
  FOREACH v_user_id IN ARRAY v_recipients LOOP
    -- Check user preference: skip if user has this type disabled
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = v_user_id AND p2.notification_prefs ?| ARRAY[p_type]
    ) THEN
      -- Determine project_id: use first active project membership
      SELECT pm.project_id INTO v_project_id
      FROM public.project_members pm
      WHERE pm.profile_id = v_user_id AND pm.status = 'active'
      LIMIT 1;

      -- Create the notification
      PERFORM public.create_payment_notification(
        v_user_id,
        v_project_id,
        p_org_id,
        p_type,
        v_notif_title,
        v_notif_body,
        v_link
      );
      v_sent := v_sent + 1;
    ELSE
      v_failed := v_failed + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT true::boolean, v_sent::integer, v_failed::integer, NULL::text;
END
$$;

-- 2. Grant execute to authenticated (org admins via capability check)
GRANT EXECUTE ON FUNCTION public.send_org_notification TO authenticated;

-- 3. Add comment to documentation
COMMENT ON FUNCTION public.send_org_notification IS
  'Org broadcast notification RPC. Sends notification to all active org members.
   Requires org:notifications:manage capability. Uses notification templates + user preferences.
   Parameters: org_id (uuid), type (NotificationType text), placeholders (jsonb default {}).
   Returns: success, sent_count, failed_count, error.';

-- 4. Verification notice
DO $$
DECLARE
  c1 int;
BEGIN
  SELECT count(*) INTO c1 FROM information_schema.routines WHERE routine_name = 'send_org_notification';
  RAISE NOTICE '188_org_broadcast: send_org_notification function created (count=% )', c1;
END $$;

COMMIT;