-- SiteTrack Pro — org_integrations v3 bridge (2026-06-06).
--
-- The org-admin Integrations panel lets an org admin store their OWN 3rd-party
-- provider creds (WhatsApp / AI / Razorpay / Cashfree). This:
--   1. GRANTs the table to authenticated + adds a v3 write policy (org admins,
--      via has_org_tier) — the legacy write policy used single-org helpers.
--      (Read was already tightened to admins in migration 82.)
--   2. Adds org_integrations_status(org) — returns ONLY booleans (which
--      providers are configured), so secrets never leave the DB to populate the
--      UI. The admin re-enters values to change them.
--
-- NOTE: provider secrets are stored as plaintext JSONB, protected by RLS
-- (admin-only). Encrypting at rest (pgcrypto) is a future hardening step.
-- IDEMPOTENT.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_integrations TO authenticated;
REVOKE ALL ON public.org_integrations FROM anon;

DROP POLICY IF EXISTS v3_write_org_integrations ON public.org_integrations;
CREATE POLICY v3_write_org_integrations ON public.org_integrations FOR ALL
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'))
  WITH CHECK (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'));

-- Booleans only — never returns the stored secrets.
CREATE OR REPLACE FUNCTION public.org_integrations_status(p_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_superadmin() OR public.has_org_tier(p_org, 'admin') THEN
    COALESCE((
      SELECT jsonb_build_object(
        'ai',       (oi.ai       IS NOT NULL AND oi.ai       <> '{}'::jsonb),
        'razorpay', (oi.razorpay IS NOT NULL AND oi.razorpay <> '{}'::jsonb),
        'whatsapp', (oi.whatsapp IS NOT NULL AND oi.whatsapp <> '{}'::jsonb),
        'cashfree', (oi.cashfree IS NOT NULL AND oi.cashfree <> '{}'::jsonb)
      )
      FROM public.org_integrations oi WHERE oi.org_id = p_org
    ), jsonb_build_object('ai', false, 'razorpay', false, 'whatsapp', false, 'cashfree', false))
  ELSE NULL END;
$$;
GRANT EXECUTE ON FUNCTION public.org_integrations_status(uuid) TO authenticated;

COMMIT;
