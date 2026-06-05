-- SiteTrack Pro — per-org custom roles (HRMS pattern, 2026-06-04).
--
-- Decision (founder): each org can have its OWN named roles on top of the 22
-- standard ones. Superadmin DEFINES a custom role + its feature set per org
-- ("Site Lead", "Billing Head", ...). Org admins (HR-admin) ASSIGN members to
-- those roles. Capabilities a custom role grants layer (additively) on the
-- member's resolved set in that org — the v3 RoleResolver reads them.
--
-- Three tables:
--   org_roles              — the custom role definitions, per org
--   org_role_capabilities  — which capabilities each custom role grants
--   org_member_roles       — which members hold which custom role (assignment)
--
-- Security split:
--   role DEFINITION (create role + set features) → SUPERADMIN only
--   role ASSIGNMENT (give a member a role)        → org ADMIN or superadmin
--   reads                                          → members of the org
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. org_roles — custom role definitions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key         text NOT NULL,                  -- slug, unique within the org
  label       text NOT NULL,                  -- human display name
  description text,
  based_on    text,                           -- optional standard role it was templated from (informational)
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

COMMENT ON TABLE public.org_roles IS
  'Per-org custom role definitions (HRMS designations). Superadmin-defined; assigned to members via org_member_roles. Capabilities in org_role_capabilities. See src/auth/customRoles.ts.';

CREATE INDEX IF NOT EXISTS org_roles_org_idx ON public.org_roles (org_id);

-- ── 2. org_role_capabilities — the feature set of a custom role ──────────────
CREATE TABLE IF NOT EXISTS public.org_role_capabilities (
  org_role_id uuid NOT NULL REFERENCES public.org_roles(id) ON DELETE CASCADE,
  capability  text NOT NULL,                  -- capability id (src/auth/capabilities.ts)
  PRIMARY KEY (org_role_id, capability)
);

COMMENT ON TABLE public.org_role_capabilities IS
  'Capabilities granted by a custom org role (additive). One row per (role, capability).';

-- ── 3. org_member_roles — assignment of a custom role to a member ────────────
CREATE TABLE IF NOT EXISTS public.org_member_roles (
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_role_id uuid NOT NULL REFERENCES public.org_roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz,
  PRIMARY KEY (org_id, profile_id, org_role_id)
);

COMMENT ON TABLE public.org_member_roles IS
  'Which members hold which custom org role. Assigned by org admins (HR-admin). removed_at = soft-delete.';

CREATE INDEX IF NOT EXISTS org_member_roles_member_idx ON public.org_member_roles (org_id, profile_id) WHERE removed_at IS NULL;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.org_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_member_roles      ENABLE ROW LEVEL SECURITY;

-- org_roles: read = org members; write = superadmin.
DROP POLICY IF EXISTS org_roles_read  ON public.org_roles;
DROP POLICY IF EXISTS org_roles_write ON public.org_roles;
CREATE POLICY org_roles_read ON public.org_roles
  FOR SELECT USING (org_id = ANY(public.user_org_ids()) OR public.is_superadmin());
CREATE POLICY org_roles_write ON public.org_roles
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- org_role_capabilities: read = members of the parent role's org; write = superadmin.
DROP POLICY IF EXISTS org_role_caps_read  ON public.org_role_capabilities;
DROP POLICY IF EXISTS org_role_caps_write ON public.org_role_capabilities;
CREATE POLICY org_role_caps_read ON public.org_role_capabilities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.org_roles r
            WHERE r.id = org_role_capabilities.org_role_id
              AND (r.org_id = ANY(public.user_org_ids()) OR public.is_superadmin()))
  );
CREATE POLICY org_role_caps_write ON public.org_role_capabilities
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- org_member_roles: read = org members; write = org admin of that org OR superadmin.
DROP POLICY IF EXISTS org_member_roles_read  ON public.org_member_roles;
DROP POLICY IF EXISTS org_member_roles_write ON public.org_member_roles;
CREATE POLICY org_member_roles_read ON public.org_member_roles
  FOR SELECT USING (org_id = ANY(public.user_org_ids()) OR public.is_superadmin());
CREATE POLICY org_member_roles_write ON public.org_member_roles
  FOR ALL
  USING (public.has_org_tier(org_id, 'admin') OR public.is_superadmin())
  WITH CHECK (public.has_org_tier(org_id, 'admin') OR public.is_superadmin());

-- ── 5. Grants ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_roles             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_role_capabilities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_member_roles      TO authenticated;
REVOKE ALL ON public.org_roles             FROM anon;
REVOKE ALL ON public.org_role_capabilities FROM anon;
REVOKE ALL ON public.org_member_roles      FROM anon;

COMMIT;
