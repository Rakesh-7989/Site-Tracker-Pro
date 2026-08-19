-- SiteTrack Pro — SEC-04 cross-tenant test finding: payment inserts fail.
--
-- notify_payment_received() (migration 176) tried to also notify the "creator
-- of the invoice/RA bill" by reading created_by from public.invoices /
-- public.ra_bills — but neither table has that column. Every AFTER INSERT on
-- payments therefore threw:
--   column "created_by" does not exist
-- which made the entire payments feature broken on the live DB.
--
-- There is no creator column on invoices/ra_bills (and none to backfill), so
-- the intended extra-recipient block is simply dropped; the primary recipient
-- list (org admins / pm / project_admin / project_head) remains unchanged.
-- Also hardens the FOREACH against a NULL recipient array (project with no
-- matching member → payments insert would otherwise throw "FOREACH expression
-- must not be null").
-- Idempotent CREATE OR REPLACE, no schema/grants change.

BEGIN;

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

  -- Send notification to each recipient (COALESCE: no matching member → empty)
  FOREACH v_user_id IN ARRAY COALESCE(v_recipients, ARRAY[]::uuid[]) LOOP
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

COMMIT;
