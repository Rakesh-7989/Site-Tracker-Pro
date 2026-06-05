-- SiteTrack Pro — security hardening (2026-06-06, from the June audit).
--
-- P1 fixes:
--   1. validate_share_token() is SECURITY DEFINER without a fixed search_path
--      → search-path-hijack vector. Pin it.
--   2. org_integrations holds 3rd-party API creds but is readable by ANY org
--      member → tighten read to org admins (+ superadmin).
--   3. subscriptions (billing/payment state) readable by any org member →
--      tighten read to org admins.
--   4. Add an `ip` column to signup_requests so the public submit EF can
--      rate-limit by source IP.
--
-- IDEMPOTENT.

BEGIN;

-- 1. Pin search_path on the share-token validator (keep its body untouched).
ALTER FUNCTION public.validate_share_token(text) SET search_path = public;

-- 2. org_integrations: read = org admin or superadmin (was: any org member).
DROP POLICY IF EXISTS org_integrations_read ON public.org_integrations;
CREATE POLICY org_integrations_read ON public.org_integrations FOR SELECT
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'));

-- 3. subscriptions: read = org admin or superadmin (was: any org member).
DROP POLICY IF EXISTS subscriptions_read ON public.subscriptions;
CREATE POLICY subscriptions_read ON public.subscriptions FOR SELECT
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'));

-- 4. signup_requests: capture source IP for throttling.
ALTER TABLE public.signup_requests ADD COLUMN IF NOT EXISTS ip text;
CREATE INDEX IF NOT EXISTS idx_signup_ip_time ON public.signup_requests(ip, created_at DESC);

COMMIT;
