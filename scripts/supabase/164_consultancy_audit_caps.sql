-- SiteTrack Pro — v4 Phase C: consultancy inspection/audit plan feature_caps.
-- Run AFTER 163_consultancy_audits.sql. Idempotent.
--
-- The `audit_reports` feature was added to src/auth/planCaps.ts in Phase C but
-- was never seeded into plans.feature_caps (migration 96 predates it), so
-- hasPlanCap() would deny everyone. This migration flips it on per its
-- FEATURE_MIN_PLAN (Business+):
--   Basic      → off
--   Pro        → off (audit reports are a Business-tier depth feature)
--   Business+  → on (enterprise/custom on)
--
-- JS source of truth: src/auth/planCaps.ts#FEATURE_MIN_PLAN
-- Uses jsonb merge (||) so prior keys survive. IDEMPOTENT.

BEGIN;

UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'audit_reports', false
), updated_at = now() WHERE id = 'basic';

UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'audit_reports', false
), updated_at = now() WHERE id = 'pro';

UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'audit_reports', true
), updated_at = now() WHERE id = 'business';

UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'audit_reports', true
), updated_at = now() WHERE id IN ('enterprise', 'custom');

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, (feature_caps->>'audit_reports') audit
    FROM public.plans WHERE id IN ('basic','pro','business','enterprise')
    ORDER BY display_order LOOP
    RAISE NOTICE '164_consultancy_audit_caps: % → audit_reports=%', r.id, r.audit;
  END LOOP;
END $$;

COMMIT;