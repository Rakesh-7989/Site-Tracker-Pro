-- SiteTrack Pro — Subscription alerts & billing overview (Session 30+).
--
-- R&D gap: Org admin could only see basic subscription status with no billing
-- history and no alert system. This migration adds:
--   1. cancelled_at / grace_period_ends_at columns to subscriptions
--   2. get_org_billing_full() RPC — subscription + billing history
--   3. get_org_subscription_alerts() RPC — active alerts for the org
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. Add lifecycle columns to subscriptions ───────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

-- ── 2. Extended billing overview — subscription + recent billing history ────
CREATE OR REPLACE FUNCTION public.get_org_billing_full(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (public.is_superadmin() OR public.has_org_tier(p_org, 'admin')) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'org', jsonb_build_object(
      'name', o.name,
      'slug', o.slug,
      'plan', o.plan,
      'createdAt', o.created_at
    ),
    'subscription', CASE WHEN s.org_id IS NOT NULL THEN jsonb_build_object(
      'status', s.status,
      'plan', s.plan,
      'provider', s.provider,
      'externalId', s.external_id,
      'currentPeriodStart', s.current_period_start,
      'currentPeriodEnd', s.current_period_end,
      'trialEndsAt', s.trial_ends_at,
      'cancelledAt', s.cancelled_at,
      'gracePeriodEndsAt', s.grace_period_ends_at,
      'updatedAt', s.updated_at
    ) ELSE NULL END,
    'billingHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bh.id,
        'amount', bh.amount,
        'currency', bh.currency,
        'gst', bh.gst,
        'status', bh.status,
        'paidAt', bh.paid_at,
        'externalId', bh.external_id,
        'invoiceUrl', bh.invoice_url
      ) ORDER BY bh.paid_at DESC NULLS LAST)
      FROM public.billing_history bh
      WHERE bh.org_id = p_org
      LIMIT 50
    ), '[]'::jsonb),
    'alerts', public.get_org_subscription_alerts(p_org)
  ) INTO result
  FROM public.organizations o
  LEFT JOIN public.subscriptions s ON s.org_id = o.id
  WHERE o.id = p_org;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_billing_full(uuid) TO authenticated;

-- ── 3. Subscription alerts — returns actionable issues for the org ──────────
CREATE OR REPLACE FUNCTION public.get_org_subscription_alerts(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_status text;
  v_period_end timestamptz;
  v_trial_end  timestamptz;
  v_grace_end  timestamptz;
  v_days_until int;
  v_alerts jsonb;
BEGIN
  IF NOT (public.is_superadmin() OR p_org = ANY(public.user_org_ids())) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT s.status, s.current_period_end, s.trial_ends_at, s.grace_period_ends_at
    INTO v_sub_status, v_period_end, v_trial_end, v_grace_end
    FROM public.subscriptions s WHERE s.org_id = p_org;

  v_alerts := '[]'::jsonb;

  -- No subscription at all
  IF v_sub_status IS NULL THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity', 'warning',
      'code', 'no_subscription',
      'message', 'No active subscription. Set up billing to continue using all features.',
      'actionLabel', 'View plans',
      'actionRoute', '/org/billing'
    );
    RETURN v_alerts;
  END IF;

  -- Past due (payment failed)
  IF v_sub_status = 'past_due' THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity', 'danger',
      'code', 'payment_past_due',
      'message', 'Payment is overdue. Your subscription will be paused if not resolved soon.',
      'actionLabel', 'Update payment',
      'actionRoute', '/org/billing'
    );
  END IF;

  -- Paused (admin-initiated)
  IF v_sub_status = 'paused' THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity', 'warning',
      'code', 'subscription_paused',
      'message', 'Your subscription is paused. Reactivate to restore full access.',
      'actionLabel', 'Reactivate',
      'actionRoute', '/org/billing'
    );
  END IF;

  -- Cancelled
  IF v_sub_status = 'cancelled' THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity', 'danger',
      'code', 'subscription_cancelled',
      'message', 'Your subscription has ended. Renew to continue using SiteTrack Pro.',
      'actionLabel', 'View plans',
      'actionRoute', '/org/billing'
    );
  END IF;

  -- Period ending soon (within 7 days)
  IF v_sub_status = 'active' AND v_period_end IS NOT NULL THEN
    v_days_until := (v_period_end::date - CURRENT_DATE);
    IF v_days_until BETWEEN 1 AND 7 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity', 'info',
        'code', 'period_ending_soon',
        'message', 'Your billing period ends in ' || v_days_until || ' day' || CASE WHEN v_days_until > 1 THEN 's' ELSE '' END || '.',
        'actionLabel', 'View billing',
        'actionRoute', '/org/billing'
      );
    ELSIF v_days_until <= 0 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity', 'danger',
        'code', 'period_ended',
        'message', 'Your billing period has ended. Renew to continue.',
        'actionLabel', 'Renew now',
        'actionRoute', '/org/billing'
      );
    END IF;
  END IF;

  -- Trial ending soon (within 7 days)
  IF v_trial_end IS NOT NULL THEN
    v_days_until := (v_trial_end::date - CURRENT_DATE);
    IF v_days_until BETWEEN 1 AND 7 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity', 'info',
        'code', 'trial_ending_soon',
        'message', 'Your trial ends in ' || v_days_until || ' day' || CASE WHEN v_days_until > 1 THEN 's' ELSE '' END || '. Set up billing to continue.',
        'actionLabel', 'Set up billing',
        'actionRoute', '/org/billing'
      );
    ELSIF v_days_until <= 0 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity', 'danger',
        'code', 'trial_ended',
        'message', 'Your trial has ended. Subscribe to continue using SiteTrack Pro.',
        'actionLabel', 'Subscribe now',
        'actionRoute', '/org/billing'
      );
    END IF;
  END IF;

  RETURN v_alerts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_subscription_alerts(uuid) TO authenticated;

COMMIT;
