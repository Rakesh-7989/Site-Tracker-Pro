-- SiteTrack Pro — RBAC V2 substrate: capabilities catalog + role profiles +
-- bindings + org mode + authorization audit (2026-08-16).
--
-- Layers on top of the hardcoded permissions matrix (src/auth/permissions-
-- matrix.ts) without replacing it:
--
--   rbac_capabilities       — single source of truth for the capability set,
--                             seeded from src/auth/capabilities.ts (107 ids).
--                             Adding a capability to the TS file + this seed
--                             keeps the catalog fresh (upsert, idempotent).
--   rbac_role_profiles      — reusable, named role definitions. A system
--                             profile references source_role (an identity
--                             role) whose matrix caps form the BASE; org
--                             admins layer org-scoped copies on top.
--   rbac_profile_bindings   — per-profile deltas over the base:
--                             effect 'allow' adds, 'deny' explicitly strips.
--                             Deny WINS over allow + overrides (SoD-style
--                             explicit deny).
--   org_rbac_settings       — per-org V2 mode: 'matrix' (off, default) |
--                             'shadow' (compute V2, matrix still decides,
--                             every decision audited) | 'enforce' (V2 decides).
--   authorization_audit     — append-only log of every authorization decision.
--
-- RLS posture: catalog + profiles + bindings are READ-visible to any
-- authenticated user (they're capability metadata); profile/binding WRITE is
-- superadmin OR (org admin whose plan unlocks custom_roles) creating an
-- org-scoped profile. Audit is insert-self, select = superadmin | event org's
-- admins. org_rbac_settings write = superadmin | org admin.
--
-- The TS resolver (src/auth/rbac2/) reads these + the ACL layer (migration
-- 204) to compose the effective capability set.
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. Capability catalog ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rbac_capabilities (
  id          text PRIMARY KEY,            -- capability id (domain:action)
  domain      text NOT NULL,               -- first segment (project, finance, …)
  label       text NOT NULL,               -- display label (defaults to id)
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rbac_capabilities IS
  'RBAC V2 capability catalog — seeded from src/auth/capabilities.ts. Single source of truth for capability ids used by role profiles + resource ACL entries.';

INSERT INTO public.rbac_capabilities (id, domain, label)
SELECT c.id, split_part(c.id, ':', 1), c.id
FROM (
  SELECT unnest(ARRAY[
    'project:create','project:archive','project:restore','project:delete','project:settings:edit',
    'progress:edit','milestone:add','milestone:edit','milestone:delete',
    'dpr:submit','dpr:approve','dpr:view',
    'voice:record','photo:upload','photo:geotag:override',
    'update:add','update:edit','update:delete','issue:add','issue:resolve',
    'safety:report','safety:close','inspection:create','inspection:close',
    'punchlist:add','punchlist:close',
    'team:manage','attendance:mark','attendance:view','labour:manage',
    'material:add','material:edit','material:delete','material:price:view',
    'vendor:manage','vendor:select','po:create','po:approve',
    'drawings:upload','drawings:edit','drawings:release','drawings:markup',
    'drawing:comment','drawing:approve','share:link:manage',
    'boq:edit','estimate:edit',
    'rfi:create','rfi:respond','rfi:close','changeorder:create','changeorder:approve',
    'expense:add','expense:approve','rabill:create','rabill:approve',
    'invoice:create','invoice:approve','budget:view','budget:edit','ledger:view',
    'compliance:view','rera:file','gstn:file','epfo:file',
    'phase:manage','time:log','time:manage','deliverable:manage','deliverable:approve',
    'review:comment','review:manage','utilization:view',
    'rate:manage','time:approve','retainer:manage','billing:generate','revenue:view',
    'ffe:manage','statutory:manage','procurement:view',
    'crm:view','crm:manage',
    'research:view','research:manage',
    'audit:manage',
    'message:send','notification:configure','whatsapp:send','digest:subscribe','digest:receive',
    'activity:view','audit:read',
    'export:pdf','export:csv','share:project:public','share:client:portal',
    'handover:generate','handover:view','handover:sign',
    'org:members:manage','org:billing:manage','org:integrations:manage','org:templates:manage',
    'org:approvals:manage','org:notifications:manage','org:branding:manage','org:features:configure',
    'platform:users:manage','platform:orgs:manage','platform:billing:manage','platform:settings:manage',
    'platform:impersonate','platform:audit:read:cross-org','platform:roles:configure',
    'platform:usage:view','platform:support:manage','platform:branding:manage','platform:featureflags:manage'
  ]) AS id
) c
ON CONFLICT (id) DO UPDATE
  SET domain = EXCLUDED.domain, label = EXCLUDED.label, is_active = true;

-- ── 2. Role profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rbac_role_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,             -- stable slug (arch_principal, …)
  name          text NOT NULL,
  description   text,
  segment       text CHECK (segment IS NULL OR segment IN ('construction','architecture','interior','consultancy','multiple')),
  scope         text NOT NULL DEFAULT 'org' CHECK (scope IN ('org','project')),
  -- System profiles reference an identity role whose matrix caps form the base;
  -- org-created profiles have source_role NULL and are pure binding sets.
  source_role   text,
  is_system     boolean NOT NULL DEFAULT false,
  org_id        uuid REFERENCES public.organizations(id) ON DELETE CASCADE,  -- NULL = platform/system profile
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_role_profiles_code_uniq
  ON public.rbac_role_profiles (code);
CREATE INDEX IF NOT EXISTS rbac_role_profiles_org_idx
  ON public.rbac_role_profiles (org_id);

COMMENT ON TABLE public.rbac_role_profiles IS
  'RBAC V2 reusable role profiles. System profiles (is_system, org_id NULL) seed from an identity role; org profiles are org-scoped binding sets.';

-- ── 3. Profile bindings (explicit allow/deny deltas) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.rbac_profile_bindings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.rbac_role_profiles(id) ON DELETE CASCADE,
  capability  text NOT NULL REFERENCES public.rbac_capabilities(id) ON DELETE CASCADE,
  effect      text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  note        text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_profile_bindings_uniq
  ON public.rbac_profile_bindings (profile_id, capability);

COMMENT ON TABLE public.rbac_profile_bindings IS
  'Per-profile capability deltas over the source_role base. allow = add, deny = explicitly strip (deny wins over allow + overrides).';

-- ── 4. Org V2 mode ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_rbac_settings (
  org_id      uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  mode        text NOT NULL DEFAULT 'matrix' CHECK (mode IN ('matrix','shadow','enforce')),
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_rbac_settings IS
  'Per-org RBAC V2 mode: matrix (off) | shadow (V2 computed + audited, matrix decides) | enforce (V2 decides).';

-- ── 5. Authorization audit ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.authorization_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid,                       -- auth uid performing the check
  org_id        uuid,
  project_id    uuid,
  resource_type text,                       -- org | project | document | drawing | …
  resource_id   uuid,
  capability    text NOT NULL,
  effect        text NOT NULL,              -- allow | deny
  mode          text NOT NULL DEFAULT 'matrix',  -- matrix | shadow | enforce
  reason        text,                       -- matrix | override | profile | deny | acl | superadmin
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authorization_audit_actor_idx  ON public.authorization_audit (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS authorization_audit_org_idx    ON public.authorization_audit (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS authorization_audit_cap_idx    ON public.authorization_audit (capability, created_at DESC);

COMMENT ON TABLE public.authorization_audit IS
  'Append-only authorization decision log written by the RBAC V2 resolver (shadow + enforce modes).';

-- ── 6. Seed system profiles (3 industry segments) ─────────────────────────────
DO $$
DECLARE
  v_pm uuid; v_sh uuid; v_arch uuid; v_drafter uuid;
  v_int uuid; v_stylist uuid; v_partner uuid; v_analyst uuid;
BEGIN
  -- Construction
  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('construction_pm', 'Construction PM', 'Project manager profile (base = pm identity role)', 'construction', 'project', 'pm', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_pm;

  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('construction_site_head', 'Site Head', 'Senior site leadership profile (base = project_head)', 'construction', 'project', 'project_head', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_sh;

  -- Architecture
  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('architecture_principal', 'Architecture Principal', 'Principal architect profile (base = design_head)', 'architecture', 'project', 'design_head', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_arch;

  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('architecture_drafter', 'Drafter', 'CAD drafter profile (base = junior_architect)', 'architecture', 'project', 'junior_architect', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_drafter;

  -- Interior
  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('interior_principal', 'Interior Principal', 'Principal interior designer (base = design_head)', 'interior', 'project', 'design_head', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_int;

  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('interior_stylist', 'Interior Stylist', 'Stylist / spec assistant (base = designer)', 'interior', 'project', 'designer', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_stylist;

  -- Consultancy
  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('consultancy_partner', 'Consultancy Partner', 'Engagement partner (base = consultant_head)', 'consultancy', 'project', 'consultant_head', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_partner;

  INSERT INTO public.rbac_role_profiles (code, name, description, segment, scope, source_role, is_system)
  VALUES ('consultancy_analyst', 'Consultancy Analyst', 'Analyst / researcher (base = consultant)', 'consultancy', 'project', 'consultant', true)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO v_analyst;

  -- Delta bindings for the seeded profiles (demonstrate allow + deny layering).
  -- Drafter: drafting is upload+markup; explicitly deny release/approve.
  IF v_drafter IS NOT NULL THEN
    INSERT INTO public.rbac_profile_bindings (profile_id, capability, effect, note)
    VALUES
      (v_drafter, 'drawings:upload',   'allow', 'seeded'),
      (v_drafter, 'drawings:markup',   'allow', 'seeded'),
      (v_drafter, 'drawings:release',  'deny',  'seeded: drafter does not release'),
      (v_drafter, 'drawing:approve',   'deny',  'seeded: drafter does not approve')
    ON CONFLICT (profile_id, capability) DO NOTHING;
  END IF;

  -- Analyst: manage time + deliverables, but not approvals / utilization.
  IF v_analyst IS NOT NULL THEN
    INSERT INTO public.rbac_profile_bindings (profile_id, capability, effect, note)
    VALUES
      (v_analyst, 'deliverable:manage', 'allow', 'seeded'),
      (v_analyst, 'deliverable:approve', 'deny',  'seeded'),
      (v_analyst, 'utilization:view',    'deny',  'seeded: analysts do not see org utilization')
    ON CONFLICT (profile_id, capability) DO NOTHING;
  END IF;
END $$;

-- ── 7. RLS + grants ───────────────────────────────────────────────────────────
ALTER TABLE public.rbac_capabilities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_role_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_profile_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_rbac_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_audit   ENABLE ROW LEVEL SECURITY;

-- Catalog: read = any authenticated (metadata); no writes.
DROP POLICY IF EXISTS rbac_caps_read ON public.rbac_capabilities;
CREATE POLICY rbac_caps_read ON public.rbac_capabilities
  FOR SELECT USING (true);

-- Profiles: read = any authenticated; write = superadmin OR org admin with
-- custom_roles plan writing an org-scoped (or system) profile.
DROP POLICY IF EXISTS rbac_profiles_read ON public.rbac_role_profiles;
CREATE POLICY rbac_profiles_read ON public.rbac_role_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS rbac_profiles_write ON public.rbac_role_profiles;
CREATE POLICY rbac_profiles_write ON public.rbac_role_profiles
  FOR ALL
  USING (
    public.is_superadmin()
    OR (
      public.has_org_tier(COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), 'admin')
      AND public.org_unlocks_custom_roles(COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid))
      AND NOT is_system
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_org_tier(COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), 'admin')
      AND public.org_unlocks_custom_roles(COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid))
      AND NOT is_system
    )
  );

-- Bindings: read = any authenticated; write gated via parent profile.
DROP POLICY IF EXISTS rbac_bindings_read ON public.rbac_profile_bindings;
CREATE POLICY rbac_bindings_read ON public.rbac_profile_bindings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS rbac_bindings_write ON public.rbac_profile_bindings;
CREATE POLICY rbac_bindings_write ON public.rbac_profile_bindings
  FOR ALL
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.rbac_role_profiles p
       WHERE p.id = rbac_profile_bindings.profile_id
         AND (
           p.org_id IS NULL
           OR (public.has_org_tier(p.org_id, 'admin') AND public.org_unlocks_custom_roles(p.org_id))
         )
         AND NOT p.is_system
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.rbac_role_profiles p
       WHERE p.id = rbac_profile_bindings.profile_id
         AND (
           p.org_id IS NULL
           OR (public.has_org_tier(p.org_id, 'admin') AND public.org_unlocks_custom_roles(p.org_id))
         )
         AND NOT p.is_system
         AND public.is_org_grantable_cap(capability)   -- block platform:* escalation
    )
  );

-- Org settings: read = any authenticated; write = superadmin OR that org's admin.
DROP POLICY IF EXISTS org_rbac_settings_read ON public.org_rbac_settings;
CREATE POLICY org_rbac_settings_read ON public.org_rbac_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS org_rbac_settings_write ON public.org_rbac_settings;
CREATE POLICY org_rbac_settings_write ON public.org_rbac_settings
  FOR ALL
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'))
  WITH CHECK (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'));

-- Audit: insert = self only; select = superadmin OR an admin of the event org
-- (cross-org platform reads stay superadmin-gated; org_id NULL = platform event).
DROP POLICY IF EXISTS authz_audit_insert ON public.authorization_audit;
CREATE POLICY authz_audit_insert ON public.authorization_audit
  FOR INSERT
  WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS authz_audit_select ON public.authorization_audit;
CREATE POLICY authz_audit_select ON public.authorization_audit
  FOR SELECT
  USING (
    public.is_superadmin()
    OR (
      org_id IS NOT NULL
      AND public.has_org_tier(org_id, 'admin')
    )
  );

GRANT SELECT ON public.rbac_capabilities     TO authenticated;
GRANT SELECT ON public.rbac_role_profiles    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_role_profiles TO authenticated;
GRANT SELECT ON public.rbac_profile_bindings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_profile_bindings TO authenticated;
GRANT SELECT ON public.org_rbac_settings     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_rbac_settings TO authenticated;
GRANT SELECT, INSERT ON public.authorization_audit TO authenticated;

REVOKE ALL ON public.rbac_capabilities     FROM anon;
REVOKE ALL ON public.rbac_role_profiles    FROM anon;
REVOKE ALL ON public.rbac_profile_bindings FROM anon;
REVOKE ALL ON public.org_rbac_settings     FROM anon;
REVOKE ALL ON public.authorization_audit   FROM anon;

DO $$ BEGIN
  RAISE NOTICE '203_rbac_v2_catalog: catalog seeded, system profiles + bindings created, RLS + grants applied.';
END $$;

COMMIT;