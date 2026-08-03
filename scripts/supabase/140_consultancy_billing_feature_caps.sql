-- SiteTrack Pro — v4 Phase C2: Consultancy billing plan feature_caps.
-- Run AFTER 139_deliverables_reviews.sql. Idempotent.
--
-- The 4 v4 C2 features were added to src/auth/planCaps.ts in Phase C2 but were
-- never seeded into plans.feature_caps (migration 96 predates them), so
-- hasPlanCap() would deny everyone. This migration flips them on per their
-- FEATURE_MIN_PLAN (all → Pro, like the C1 fee/time/deliverables features):
--   Pro+      → rate_cards, time_approval, retainer_billing, hourly_billing
--   Basic     → all off
--
-- JS source of truth: src/auth/planCaps.ts#FEATURE_MIN_PLAN
-- Uses jsonb merge (||) so prior keys (incl. the C1/136 seeds) survive. IDEMPOTENT.

BEGIN;

-- Basic ─ entry tier: C2 billing features disabled.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'rate_cards', false, 'time_approval', false,
  'retainer_billing', false, 'hourly_billing', false
), updated_at = now() WHERE id = 'basic';

-- Pro ─ rate cards + approval + retainer + hourly billing all on.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'rate_cards', true, 'time_approval', true,
  'retainer_billing', true, 'hourly_billing', true
), updated_at = now() WHERE id = 'pro';

-- Business ─ everything on.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'rate_cards', true, 'time_approval', true,
  'retainer_billing', true, 'hourly_billing', true
), updated_at = now() WHERE id = 'business';

-- Enterprise + Custom ─ everything on.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'rate_cards', true, 'time_approval', true,
  'retainer_billing', true, 'hourly_billing', true
), updated_at = now() WHERE id IN ('enterprise', 'custom');

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id,
      (feature_caps->>'rate_cards') rates,
      (feature_caps->>'time_approval') approv,
      (feature_caps->>'retainer_billing') retainer,
      (feature_caps->>'hourly_billing') hourly
    FROM public.plans WHERE id IN ('basic','pro','business','enterprise')
    ORDER BY display_order LOOP
    RAISE NOTICE '140_consultancy_billing_feature_caps: % → rate_cards=% time_approval=% retainer_billing=% hourly_billing=%',
      r.id, r.rates, r.approv, r.retainer, r.hourly;
  END LOOP;
END $$;

COMMIT;
