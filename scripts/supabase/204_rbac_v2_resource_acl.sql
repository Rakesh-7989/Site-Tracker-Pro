-- SiteTrack Pro — RBAC V2 resource ACL + client/vendor scopes + check RPC (2026-08-16).
--
-- Resource-level authorization on top of migration 203's catalog + profiles:
--
--   resource_acl_entries      — fine-grained per-resource capability grants.
--                               subject = user (uuid), org tier, or identity
--                               role; effect allow/deny; resource_type + id.
--                               DENY entries always win (explicit deny /
--                               separation-of-duties style).
--   client_portal_permissions — scoped capabilities a client may hold on a
--                               share (e.g. drawing:approve) beyond the base
--                               client identity caps.
--   vendor_project_scopes     — project access grants for vendor identity
--                               users (vendor:manage POs/quotes scoped here).
--   v2_check_access()         — SECURITY DEFINER RPC the resolver calls for a
--                               resource-scoped decision. Applies:
--                                 superadmin         → allow
--                                 explicit deny ACL  → deny  (highest)
--                                 resource allow ACL → allow (subject-match)
--                                 client perms       → allow (client share)
--                                 vendor scope       → allow (vendor project)
--                                 else               → matrix default (member)
--
-- RLS posture: ACL/perms/scopes are ORG-SCOPED metadata — read by any
-- authenticated user, write = org admin (plan-gated) | superadmin.
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. Resource ACL ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_acl_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_type text NOT NULL,             -- org | project | document | drawing | …
  resource_id   uuid NOT NULL,
  subject_type  text NOT NULL CHECK (subject_type IN ('user','org_tier','identity_role')),
  subject_id    text NOT NULL,             -- uuid (user) | tier name | identity role
  capability    text NOT NULL REFERENCES public.rbac_capabilities(id) ON DELETE CASCADE,
  effect        text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  note          text,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_acl_entries_uniq
  ON public.resource_acl_entries (org_id, resource_type, resource_id, subject_type, subject_id, capability);
CREATE INDEX IF NOT EXISTS resource_acl_entries_lookup
  ON public.resource_acl_entries (resource_type, resource_id, subject_type, subject_id);

COMMENT ON TABLE public.resource_acl_entries IS
  'RBAC V2 per-resource capability grants. Deny always wins over allow. Resource-scoped checks go through v2_check_access().';

-- ── 2. Client portal permissions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_portal_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES public.projects(id) ON DELETE CASCADE,   -- NULL = org-wide
  client_email  text NOT NULL,
  capability    text NOT NULL REFERENCES public.rbac_capabilities(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_permissions_uniq
  ON public.client_portal_permissions (org_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), client_email, capability);

COMMENT ON TABLE public.client_portal_permissions IS
  'RBAC V2 scoped client capabilities beyond the base client identity caps (e.g. drawing:approve on a share).';

-- ── 3. Vendor project scopes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_project_scopes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_id    uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  profile_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE,    -- linked vendor account
  granted_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS vendor_project_scopes_org_idx  ON public.vendor_project_scopes (org_id);
CREATE INDEX IF NOT EXISTS vendor_project_scopes_vendor_idx ON public.vendor_project_scopes (vendor_id);

COMMENT ON TABLE public.vendor_project_scopes IS
  'RBAC V2: scopes a vendor to specific projects (PO/quote visibility) without granting org-wide access.';

-- ── 4. v2_check_access RPC ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.v2_check_access(
  p_capability   text,
  p_resource_type text DEFAULT NULL,
  p_resource_id  uuid DEFAULT NULL,
  p_client_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_orgs   uuid[];
  v_allowed boolean := false;
  v_denied  boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Superadmin is god (matches the TS resolver + overrides module).
  IF public.is_superadmin() THEN
    RETURN true;
  END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  v_orgs := public.user_org_ids();

  -- 1. Explicit DENY on a matching resource → always deny (SoD / least privilege).
  IF p_resource_type IS NOT NULL AND p_resource_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.resource_acl_entries e
       WHERE e.resource_type = p_resource_type
         AND e.resource_id   = p_resource_id
         AND e.capability    = p_capability
         AND e.effect        = 'deny'
         AND (
           (e.subject_type = 'user'         AND e.subject_id = v_uid::text)
           OR (e.subject_type = 'identity_role' AND e.subject_id = v_role)
           OR (e.subject_type = 'org_tier'  AND e.subject_id IN ('admin','pm')
               AND public.has_org_tier(COALESCE(e.org_id, v_orgs[1]), e.subject_id))
         )
    ) INTO v_denied;
    IF v_denied THEN
      RETURN false;
    END IF;

    -- 2. Explicit ALLOW on a matching resource.
    SELECT EXISTS (
      SELECT 1 FROM public.resource_acl_entries e
       WHERE e.resource_type = p_resource_type
         AND e.resource_id   = p_resource_id
         AND e.capability    = p_capability
         AND e.effect        = 'allow'
         AND (
           (e.subject_type = 'user'         AND e.subject_id = v_uid::text)
           OR (e.subject_type = 'identity_role' AND e.subject_id = v_role)
           OR (e.subject_type = 'org_tier'  AND e.subject_id IN ('admin','pm')
               AND public.has_org_tier(COALESCE(e.org_id, v_orgs[1]), e.subject_id))
         )
    ) INTO v_allowed;
    IF v_allowed THEN
      RETURN true;
    END IF;
  END IF;

  -- 3. Client portal permission (share-scoped capability grants).
  IF p_client_email IS NOT NULL AND p_capability IN ('drawing:comment','drawing:approve','share:link:manage','handover:view') THEN
    IF EXISTS (
      SELECT 1 FROM public.client_portal_permissions cp
       WHERE cp.client_email = p_client_email
         AND cp.capability   = p_capability
         AND (cp.project_id IS NULL OR cp.project_id = p_resource_id)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- 4. Vendor project scope: vendor identity users gain project access through
  --    a scope row on that project (lets vendor:manage act inside the project).
  IF p_resource_type = 'project' AND p_resource_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.vendor_project_scopes s
        JOIN public.profiles p ON p.id = v_uid
       WHERE s.project_id = p_resource_id
         AND s.profile_id = v_uid
    ) OR EXISTS (
      SELECT 1 FROM public.vendor_project_scopes s
       WHERE s.project_id = p_resource_id
         AND s.vendor_id IN (
           SELECT v.id FROM public.vendors v WHERE v.profile_id = v_uid
         )
    ) THEN
      RETURN p_capability IN ('po:create','po:approve','material:price:view','vendor:manage','vendor:select','procurement:view','drawings:upload','export:pdf','message:send');
    END IF;
  END IF;

  -- 5. Fallback: org membership (matrix default for org-scoped caps).
  RETURN cardinality(v_orgs) > 0;
END;
$$;

COMMENT ON FUNCTION public.v2_check_access(text, text, uuid, text) IS
  'RBAC V2 resource-scoped access check. Layered: superadmin → explicit deny → explicit allow → client/vendor scopes → org membership fallback.';

GRANT EXECUTE ON FUNCTION public.v2_check_access(text, text, uuid, text) TO authenticated, anon;

-- ── 5. RLS + grants ───────────────────────────────────────────────────────────
ALTER TABLE public.resource_acl_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_project_scopes      ENABLE ROW LEVEL SECURITY;

-- ACL: read = any authenticated; write = org admin (plan-gated) | superadmin.
DROP POLICY IF EXISTS rbac_acl_read ON public.resource_acl_entries;
CREATE POLICY rbac_acl_read ON public.resource_acl_entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS rbac_acl_write ON public.resource_acl_entries;
CREATE POLICY rbac_acl_write ON public.resource_acl_entries
  FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_org_tier(org_id, 'admin') AND public.org_unlocks_custom_roles(org_id))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_org_tier(org_id, 'admin') AND public.org_unlocks_custom_roles(org_id))
  );

-- Client perms: read = any authenticated; write = org admin | superadmin.
DROP POLICY IF EXISTS client_perms_read ON public.client_portal_permissions;
CREATE POLICY client_perms_read ON public.client_portal_permissions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS client_perms_write ON public.client_portal_permissions;
CREATE POLICY client_perms_write ON public.client_portal_permissions
  FOR ALL
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'))
  WITH CHECK (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'));

-- Vendor scopes: read = any authenticated; write = org admin | superadmin.
DROP POLICY IF EXISTS vendor_scopes_read ON public.vendor_project_scopes;
CREATE POLICY vendor_scopes_read ON public.vendor_project_scopes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS vendor_scopes_write ON public.vendor_project_scopes;
CREATE POLICY vendor_scopes_write ON public.vendor_project_scopes
  FOR ALL
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'))
  WITH CHECK (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_acl_entries      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_project_scopes      TO authenticated;

REVOKE ALL ON public.resource_acl_entries      FROM anon;
REVOKE ALL ON public.client_portal_permissions FROM anon;
REVOKE ALL ON public.vendor_project_scopes     FROM anon;

DO $$ BEGIN
  RAISE NOTICE '204_rbac_v2_resource_acl: ACL + client perms + vendor scopes + v2_check_access live.';
END $$;

COMMIT;