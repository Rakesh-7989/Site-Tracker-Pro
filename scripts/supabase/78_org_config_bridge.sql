-- SiteTrack Pro — v3 bridge for org-admin config tables (2026-06-05).
--
-- templates / approval_chains / notification_rules already have RLS + legacy
-- policies, but those policies key on the SINGLE-org helper user_org_id() and
-- (per the Phase-3 GRANT bug pattern) the tables may lack a table GRANT to
-- `authenticated`. This adds:
--   • GRANT SELECT/INSERT/UPDATE/DELETE to authenticated (REVOKE from anon)
--   • additive v3 policies using the MULTI-org helpers — read for any org
--     member (user_org_ids()), write for org admins (has_org_tier admin).
-- Permissive policies OR-combine, so legacy access is preserved.
--
-- IDEMPOTENT. Depends on migrations 67/72 (has_org_tier, user_org_ids).

BEGIN;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['templates','approval_chains','notification_rules'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v3_read_'||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v3_write_'||t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_superadmin() OR org_id = ANY(public.user_org_ids()))',
      'v3_read_'||t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_superadmin() OR public.has_org_tier(org_id, ''admin'')) WITH CHECK (public.is_superadmin() OR public.has_org_tier(org_id, ''admin''))',
      'v3_write_'||t, t);
  END LOOP;
END $$;

COMMIT;
