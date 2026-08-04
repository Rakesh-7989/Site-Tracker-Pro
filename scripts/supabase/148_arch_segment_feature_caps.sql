-- SiteTrack Pro — v4 Phase D: Architecture segment plan feature_caps.
-- Run AFTER 147_retainer_cron.sql. Idempotent.
--
-- The 3 v4 D features were added to src/auth/planCaps.ts in Phase C0 but were
-- never seeded into plans.feature_caps (migration 96 predates them), so
-- hasPlanCap() would deny everyone. This migration flips them on per their
-- FEATURE_MIN_PLAN:
--   Pro      → ffe
--   Business → statutory, procurement
--   Basic    → all off
--
-- JS source of truth: src/auth/planCaps.ts#FEATURE_MIN_PLAN
-- Uses jsonb merge (||) so prior keys (incl. the C1/C2 seeds) survive. IDEMPOTENT.

BEGIN;

-- Basic ─ entry tier: Architecture segment features disabled.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'ffe', false, 'statutory', false, 'procurement', false
), updated_at = now() WHERE id = 'basic';

-- Pro ─ FF&E schedules + moodboards.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'ffe', true, 'statutory', false, 'procurement', false
), updated_at = now() WHERE id = 'pro';

-- Business ─ everything on (statutory + procurement included).
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'ffe', true, 'statutory', true, 'procurement', true
), updated_at = now() WHERE id = 'business';

-- Enterprise + Custom ─ everything on.
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'ffe', true, 'statutory', true, 'procurement', true
), updated_at = now() WHERE id IN ('enterprise', 'custom');

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id,
      (feature_caps->>'ffe') ffe,
      (feature_caps->>'statutory') stat,
      (feature_caps->>'procurement') proc
    FROM public.plans WHERE id IN ('basic','pro','business','enterprise')
    ORDER BY display_order LOOP
    RAISE NOTICE '148_arch_segment_feature_caps: % → ffe=% statutory=% procurement=%',
      r.id, r.ffe, r.stat, r.proc;
  END LOOP;
END $$;

COMMIT;
