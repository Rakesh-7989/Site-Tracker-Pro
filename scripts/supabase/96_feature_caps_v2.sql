-- SiteTrack Pro — plan feature_caps v2 (2026-06-06, plan-gating enforcement).
--
-- Sets the canonical feature_caps for every plan so the v3 app + Edge Functions
-- can gate features by plan (not just role). Founder-approved 10 defaults:
--   audit: Pro 30-day / Business unlimited+export
--   whatsapp: manual share all tiers / programmatic+auto = Business
--   RERA/GSTN/EPFO filing = Business
--   ceilings: Basic 5 proj / Pro 50 / Business 200
--   storage: Basic 5GB / Pro 50GB / Business 250GB
--   custom roles = Business (+ enterprise/custom)
--   seats: Basic 5 / Pro 20 / Business 100
--
-- Uses jsonb merge (||) so prior keys survive. IDEMPOTENT.

BEGIN;

-- Basic ─ entry tier
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'users_max', 5, 'projects_max', 5, 'projects_ceiling', 5, 'storage_gb', 5,
  'whatsapp_share', true,
  'hierarchy', false, 'finance', false, 'approvals', false, 'drawings_write', false,
  'rfi', false, 'compliance_read', false, 'estimate', false, 'gantt', false, 'esign', false,
  'material_aggregator', false, 'audit_days', 0,
  'custom_roles', false, 'audit_unlimited', false, 'audit_export', false,
  'rera_filing', false, 'gstn_filing', false, 'epfo_filing', false,
  'whatsapp_send', false, 'dpr_auto', false, 'cashfree_payments', false,
  'kiosks', false, 'ar_overlay', false, 'ai_forecast', false, 'priority_support', false
), updated_at = now() WHERE id = 'basic';

-- Pro ─ operational efficiency
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'users_max', 20, 'projects_max', null, 'projects_ceiling', 50, 'storage_gb', 50,
  'whatsapp_share', true,
  'hierarchy', true, 'finance', true, 'approvals', true, 'drawings_write', true,
  'rfi', true, 'compliance_read', true, 'estimate', true, 'gantt', true, 'esign', true,
  'material_aggregator', true, 'audit_days', 30,
  'custom_roles', false, 'audit_unlimited', false, 'audit_export', false,
  'rera_filing', false, 'gstn_filing', false, 'epfo_filing', false,
  'whatsapp_send', false, 'dpr_auto', false, 'cashfree_payments', false,
  'kiosks', false, 'ar_overlay', false, 'ai_forecast', false, 'priority_support', false
), updated_at = now() WHERE id = 'pro';

-- Business ─ governance + automation + write-compliance
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'users_max', 100, 'projects_max', null, 'projects_ceiling', 200, 'storage_gb', 250,
  'whatsapp_share', true,
  'hierarchy', true, 'finance', true, 'approvals', true, 'drawings_write', true,
  'rfi', true, 'compliance_read', true, 'estimate', true, 'gantt', true, 'esign', true,
  'material_aggregator', true, 'audit_days', 365,
  'custom_roles', true, 'audit_unlimited', true, 'audit_export', true,
  'rera_filing', true, 'gstn_filing', true, 'epfo_filing', true,
  'whatsapp_send', true, 'dpr_auto', true, 'cashfree_payments', true,
  'kiosks', true, 'ar_overlay', true, 'ai_forecast', true, 'priority_support', true
), updated_at = now() WHERE id = 'business';

-- Enterprise + Custom ─ everything on, no limits
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'users_max', null, 'projects_max', null, 'projects_ceiling', null, 'storage_gb', null,
  'whatsapp_share', true,
  'hierarchy', true, 'finance', true, 'approvals', true, 'drawings_write', true,
  'rfi', true, 'compliance_read', true, 'estimate', true, 'gantt', true, 'esign', true,
  'material_aggregator', true, 'audit_days', 3650,
  'custom_roles', true, 'audit_unlimited', true, 'audit_export', true,
  'rera_filing', true, 'gstn_filing', true, 'epfo_filing', true,
  'whatsapp_send', true, 'dpr_auto', true, 'cashfree_payments', true,
  'kiosks', true, 'ar_overlay', true, 'ai_forecast', true, 'priority_support', true
), updated_at = now() WHERE id IN ('enterprise', 'custom');

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, (feature_caps->>'finance') fin, (feature_caps->>'custom_roles') cr,
                  (feature_caps->>'storage_gb') sg
           FROM public.plans WHERE id IN ('basic','pro','business','enterprise')
           ORDER BY display_order LOOP
    RAISE NOTICE '96_feature_caps: % → finance=% custom_roles=% storage_gb=%', r.id, r.fin, r.cr, r.sg;
  END LOOP;
END $$;

COMMIT;
