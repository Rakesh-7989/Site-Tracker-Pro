-- SiteTrack Pro — role capability overrides (2026-06-04).
--
-- Lets the SUPERADMIN (founder) layer per-org (or global) grants/revokes on
-- top of the hardcoded permissions matrix (src/auth/permissions-matrix.ts),
-- so "give architects in Acme Builders the expense:approve feature" needs no
-- code change. The v3 RoleResolver reads these for the user's identity role.
--
-- Decision (founder, 2026-06-04): SUPERADMIN-ONLY writes. Org admins cannot
-- self-grant — no privilege escalation. Reads are scoped so a user can see
-- the overrides that affect their own capability resolution.
--
--   org_id NULL  → global default (applies to every org)
--   org_id set   → that org only (wins over a global row for the same cap)
--   mode 'grant' → add the capability to the role
--   mode 'revoke'→ remove the capability from the role (matrix default)
--
-- IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.role_capability_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,  -- NULL = global
  role        text NOT NULL,         -- identity role being customized (profiles.role value)
  capability  text NOT NULL,         -- capability id (src/auth/capabilities.ts)
  mode        text NOT NULL CHECK (mode IN ('grant','revoke')),
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.role_capability_overrides IS
  'Superadmin-managed per-org (org_id) or global (org_id NULL) grants/revokes layered on the hardcoded permissions matrix. Applied by the v3 RoleResolver for the user''s identity role. See src/auth/capabilityOverrides.ts.';

-- Uniqueness incl. global rows (a plain UNIQUE treats NULLs as distinct, so
-- coalesce to a sentinel zero-uuid to enforce one row per global cap too).
CREATE UNIQUE INDEX IF NOT EXISTS role_capability_overrides_uniq
  ON public.role_capability_overrides
  (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), role, capability);

CREATE INDEX IF NOT EXISTS role_capability_overrides_lookup
  ON public.role_capability_overrides (role, org_id);

ALTER TABLE public.role_capability_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rco_read  ON public.role_capability_overrides;
DROP POLICY IF EXISTS rco_write ON public.role_capability_overrides;

-- Read: global rows readable by any authenticated user; org rows readable by
-- members of that org (so the resolver can apply them). user_org_ids() is
-- SECURITY DEFINER → no RLS recursion.
CREATE POLICY rco_read ON public.role_capability_overrides
  FOR SELECT
  USING (
    org_id IS NULL
    OR org_id = ANY(public.user_org_ids())
  );

-- Write: superadmin only (is_superadmin() from migration 02).
CREATE POLICY rco_write ON public.role_capability_overrides
  FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_capability_overrides TO authenticated;
REVOKE ALL ON public.role_capability_overrides FROM anon;

COMMIT;
