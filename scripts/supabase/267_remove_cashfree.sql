-- SiteTrack Pro — cashfree rail removal (2026-09-18).
--
-- Razorpay is the live payment gateway. This migration permanently removes the
-- Cashfree DB substrate while keeping historical/archival SQL untouched
-- (migrations 03/05/25/31/83/96/122/190/195/196/237/257 stay as-is; only this
-- forward migration changes the live schema).
--
-- Order of operations (dependency-safe):
--   1. DROP helper RPC record_cashfree_event (mig 31)  — only consumer was the
--      cashfree-webhook EF (deleted).        2. DROP cashfree_events table.
--   3. Recreate delete_org (mig 122) WITHOUT the cashfree_events purge step
--      (CREATE OR REPLACE keeps the mig-122 GRANT EXECUTE + COMMENT).
--   4. Recreate org_integrations_status (mig 83) WITHOUT the 'cashfree' boolean
--      (CREATE OR REPLACE keeps the mig-83 GRANT EXECUTE).
--   5. DROP org_integrations.cashfree column.         6/7/8. provider/method
--      CHECK constraints: DEFAULT flips to 'razorpay' unconditionally; the
--      'cashfree' enum value is stripped from the CHECK ONLY when no live rows
--      use it (historic Cashfree placeholder subscription/billing rows keep the
--      value; never rewrite stored data).          9. plans.feature_caps drops
--      the 'cashfree_payments' key off every plan.
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. Drop the dedup helper RPC (mig 31) that only the deleted
--      cashfree-webhook EF called ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.record_cashfree_event(
  text, uuid, text, text, text, jsonb
);

-- ── 2. Drop the webhook dedup table (policies + indexes ride along) ────────
DROP TABLE IF EXISTS public.cashfree_events;

-- ── 3. Recreate unified org deletion WITHOUT the cashfree_events purge ─────
CREATE OR REPLACE FUNCTION public.delete_org(p_org uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_actor_name text;
  v_actor_role text;
BEGIN
  -- Authorize: platform staff OR org admin
  IF NOT (public.is_staff_org_admin() OR public.has_org_tier(p_org, 'admin')) THEN
    RAISE EXCEPTION 'not authorized to delete this organization';
  END IF;

  SELECT o.name, p.name, p.role
    INTO v_name, v_actor_name, v_actor_role
    FROM public.organizations o
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = p_org;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization not found');
  END IF;

  -- Write audit entry before deletion (org still exists)
  INSERT INTO public.audit_log_v2(
    org_id, actor_id, actor_name, actor_role,
    action, resource, resource_id, message, after
  ) VALUES (
    p_org, auth.uid(), v_actor_name, v_actor_role,
    'DELETE', 'organization', p_org::text,
    COALESCE(v_actor_name, 'A staff member') || ' deleted organization "' || v_name || '": ' || COALESCE(p_reason, 'no reason given'),
    jsonb_build_object('reason', p_reason, 'deleted_name', v_name)
  );

  -- Bypass all audit-log triggers during cleanup
  PERFORM set_config('app.allow_audit_delete', 'true', true);

  -- Purge audit trail (bypasses trg_audit_log_v2_immutable)
  DELETE FROM public.audit_log_v2 WHERE org_id = p_org;

  -- Delete member rows first so their AFTER triggers fire while org still exists
  DELETE FROM public.org_members WHERE org_id = p_org;
  DELETE FROM public.projects WHERE org_id = p_org;

  -- Purge SET NULL orphan tables (DPDP right-to-erasure — no orphaned rows)
  DELETE FROM public.whatsapp_log WHERE org_id = p_org;
  DELETE FROM public.voice_transcripts WHERE org_id_first = p_org;
  DELETE FROM public.signup_requests WHERE created_org_id = p_org;

  -- Cascade-delete org (remaining child tables handled by ON DELETE CASCADE)
  DELETE FROM public.organizations WHERE id = p_org;

  -- Re-arm audit-log protection
  PERFORM set_config('app.allow_audit_delete', 'false', true);

  RETURN jsonb_build_object('ok', true, 'deleted', v_name);
END;
$$;

-- ── 4. Recreate org integration status WITHOUT the 'cashfree' boolean ───────
CREATE OR REPLACE FUNCTION public.org_integrations_status(p_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_superadmin() OR public.has_org_tier(p_org, 'admin') THEN
    COALESCE((
      SELECT jsonb_build_object(
        'ai',       (oi.ai       IS NOT NULL AND oi.ai       <> '{}'::jsonb),
        'razorpay', (oi.razorpay IS NOT NULL AND oi.razorpay <> '{}'::jsonb),
        'whatsapp', (oi.whatsapp IS NOT NULL AND oi.whatsapp <> '{}'::jsonb)
      )
      FROM public.org_integrations oi WHERE oi.org_id = p_org
    ), jsonb_build_object('ai', false, 'razorpay', false, 'whatsapp', false))
  ELSE NULL END;
$$;

-- ── 5. Drop the stored Cashfree creds column ────────────────────────────────
ALTER TABLE public.org_integrations DROP COLUMN IF EXISTS cashfree;

-- ── 6. subscriptions.provider — default to Razorpay; strip cashfree from the
--      CHECK only when no live rows use it ──────────────────────────────────
ALTER TABLE public.subscriptions ALTER COLUMN provider SET DEFAULT 'razorpay';

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.subscriptions WHERE provider = 'cashfree';
  IF n = 0 THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_provider_check;
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_provider_check
      CHECK (provider IN ('razorpay', 'manual'));
    RAISE NOTICE '267: stripped cashfree from subscriptions.provider CHECK (0 live rows)';
  ELSE
    RAISE NOTICE '267: kept cashfree in subscriptions.provider CHECK (% live row(s))', n;
  END IF;
END $$;

-- ── 7. billing_history.provider — same treatment ───────────────────────────
ALTER TABLE public.billing_history ALTER COLUMN provider SET DEFAULT 'razorpay';

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.billing_history WHERE provider = 'cashfree';
  IF n = 0 THEN
    ALTER TABLE public.billing_history DROP CONSTRAINT IF EXISTS billing_history_provider_check;
    ALTER TABLE public.billing_history ADD CONSTRAINT billing_history_provider_check
      CHECK (provider IN ('razorpay', 'manual', 'credit_note'));
    RAISE NOTICE '267: stripped cashfree from billing_history.provider CHECK (0 live rows)';
  ELSE
    RAISE NOTICE '267: kept cashfree in billing_history.provider CHECK (% live row(s))', n;
  END IF;
END $$;

-- ── 8. payments.method — same treatment (live table is EMPTY → expect strip)
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.payments WHERE method = 'cashfree';
  IF n = 0 THEN
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
    ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
      CHECK (method IN ('bank', 'cash', 'upi', 'cheque', 'other', 'razorpay'));
    RAISE NOTICE '267: stripped cashfree from payments.method CHECK (0 live rows)';
  ELSE
    RAISE NOTICE '267: kept cashfree in payments.method CHECK (% live row(s))', n;
  END IF;
END $$;

-- ── 9. plans.feature_caps — drop the cashfree_payments key everywhere ──────
UPDATE public.plans
   SET feature_caps = feature_caps - 'cashfree_payments',
       updated_at = now()
 WHERE feature_caps ? 'cashfree_payments';

-- ── Self-verify ─────────────────────────────────────────────────────────────
DO $$ DECLARE
  n_cf_events   int;
  n_cf_col      int;
  n_cf_feature  int;
BEGIN
  SELECT count(*) INTO n_cf_events  FROM pg_tables WHERE schemaname='public' AND tablename='cashfree_events';
  SELECT count(*) INTO n_cf_col     FROM pg_attribute WHERE attrelid='public.org_integrations'::regclass AND attname='cashfree';
  SELECT count(*) INTO n_cf_feature FROM public.plans WHERE feature_caps ? 'cashfree_payments';
  IF n_cf_events > 0 OR n_cf_col > 0 OR n_cf_feature > 0 THEN
    RAISE EXCEPTION 'migration 267 FAILED: cashfree remnants remain (table=%, col=%, feature_caps=%)', n_cf_events, n_cf_col, n_cf_feature;
  END IF;
  RAISE NOTICE 'migration 267 ok: cashfree substrate removed (table=0, col=0, feature_caps=0)';
END $$;

COMMIT;