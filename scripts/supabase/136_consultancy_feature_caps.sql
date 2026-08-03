-- SiteTrack Pro — v4 Phase C1: Consultancy plan feature_caps.
-- Run AFTER 135_orgs_view.sql. Idempotent.
--
-- The 8 v4 features were added to src/auth/planCaps.ts in Phase C0 but were
-- never seeded into plans.feature_caps (migration 96 predates them), so
-- hasPlanCap() denied everyone. This migration flips on the 5 consultancy
-- features per their FEATURE_MIN_PLAN:
--   Pro      → time_tracking, fee_billing, deliverables, review_rounds
--   Business → utilization
-- Non-consultancy v4 features (statutory, ffe, procurement) are left OFF here;
-- they belong to later segments (Architecture/Interior/Construction phases).
--
-- JS source of truth: src/auth/planCaps.ts#FEATURE_MIN_PLAN
-- Uses jsonb merge (||) so prior keys survive. IDEMPOTENT.

BEGIN;

-- Basic ─ entry tier: consultancy features disabled.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'time_tracking', false, 'fee_billing', false,
  'deliverables', false, 'review_rounds', false, 'utilization', false
), updated_at = now() WHERE id = 'basic';

-- Pro ─ fee + time + deliverables + reviews.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'time_tracking', true, 'fee_billing', true,
  'deliverables', true, 'review_rounds', true, 'utilization', false
), updated_at = now() WHERE id = 'pro';

-- Business ─ everything on (incl. utilization reporting).
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'time_tracking', true, 'fee_billing', true,
  'deliverables', true, 'review_rounds', true, 'utilization', true
), updated_at = now() WHERE id = 'business';

-- Enterprise + Custom ─ everything on.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'time_tracking', true, 'fee_billing', true,
  'deliverables', true, 'review_rounds', true, 'utilization', true
), updated_at = now() WHERE id IN ('enterprise', 'custom');

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id,
      (feature_caps->>'fee_billing') fee,
      (feature_caps->>'time_tracking') time,
      (feature_caps->>'deliverables') del,
      (feature_caps->>'review_rounds') rev,
      (feature_caps->>'utilization') util
    FROM public.plans WHERE id IN ('basic','pro','business','enterprise')
    ORDER BY display_order LOOP
    RAISE NOTICE '136_consultancy_feature_caps: % → fee_billing=% time_tracking=% deliverables=% review_rounds=% utilization=%',
      r.id, r.fee, r.time, r.del, r.rev, r.util;
  END LOOP;
END $$;

COMMIT;
