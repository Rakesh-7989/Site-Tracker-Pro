-- SiteTrack Pro — Phase 3: self-service custom roles for Enterprise orgs (2026-06-06).
--
-- Until now, custom org roles (migration 70) were DEFINE-able by superadmin only;
-- org admins could only ASSIGN them. This lets org ADMINS of a plan that
-- unlocks custom_roles (Business/Enterprise/Custom in the canonical seed)
-- org define their own roles + capabilities — gated two ways:
--   1. plan must unlock custom_roles (feature_caps.custom_roles = true).
--   2. capability allowlist: org admins may NOT grant platform:* caps to a custom
--      role (privilege-escalation guard). Superadmin is unrestricted.
--
-- IDEMPOTENT.

BEGIN;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Does this org's plan unlock per-org custom roles? (feature_caps.custom_roles)
CREATE OR REPLACE FUNCTION public.org_unlocks_custom_roles(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((p.feature_caps->>'custom_roles')::boolean, false)
    FROM public.organizations o JOIN public.plans p ON p.id = o.plan
   WHERE o.id = p_org;
$$;

-- Capabilities an ORG ADMIN may grant to a custom role. Denies cross-tenant
-- platform powers (platform:impersonate, platform:orgs:manage, …). Org-scoped
-- caps are fine — the admin already controls their own org.
CREATE OR REPLACE FUNCTION public.is_org_grantable_cap(p_cap text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_cap NOT LIKE 'platform:%';
$$;

-- ── RLS: org_roles — superadmin OR enterprise-plan org admin ─────────────────
DROP POLICY IF EXISTS org_roles_write ON public.org_roles;
CREATE POLICY org_roles_write ON public.org_roles
  FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_org_tier(org_id, 'admin') AND public.org_unlocks_custom_roles(org_id))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_org_tier(org_id, 'admin') AND public.org_unlocks_custom_roles(org_id))
  );

-- ── RLS: org_role_capabilities — same gate + capability allowlist ────────────
DROP POLICY IF EXISTS org_role_caps_write ON public.org_role_capabilities;
CREATE POLICY org_role_caps_write ON public.org_role_capabilities
  FOR ALL
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.org_roles r
       WHERE r.id = org_role_capabilities.org_role_id
         AND public.has_org_tier(r.org_id, 'admin')
         AND public.org_unlocks_custom_roles(r.org_id)
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      EXISTS (
        SELECT 1 FROM public.org_roles r
         WHERE r.id = org_role_capabilities.org_role_id
           AND public.has_org_tier(r.org_id, 'admin')
           AND public.org_unlocks_custom_roles(r.org_id)
      )
      AND public.is_org_grantable_cap(capability)   -- block platform:* escalation
    )
  );

GRANT EXECUTE ON FUNCTION public.org_unlocks_custom_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_grantable_cap(text) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '98_self_service: enterprise org admins can define custom roles; platform:* caps blocked for non-superadmin.';
END $$;

COMMIT;
