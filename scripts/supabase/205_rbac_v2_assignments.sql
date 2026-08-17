-- SiteTrack Pro — RBAC V2 profile assignments (2026-08-16).
--
-- Links a role profile (rbac_role_profiles) to a user within an org. The V2
-- resolver reads these to know which profile base + bindings apply when the
-- org is in shadow/enforce mode. Writes = superadmin | org admin (plan-gated
-- for org-created profiles); reads = any authenticated (metadata, org-scoped
-- rows are filtered client-side to the caller's org).
--
-- IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rbac_profile_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.rbac_role_profiles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, profile_id, user_id)
);

CREATE INDEX IF NOT EXISTS rbac_profile_assignments_user_idx
  ON public.rbac_profile_assignments (user_id, org_id);

COMMENT ON TABLE public.rbac_profile_assignments IS
  'RBAC V2: role-profile assignments per org+user. The resolver composes the member''s effective caps from assigned profiles (base = source_role matrix caps) + their bindings (allow adds, deny strips).';

ALTER TABLE public.rbac_profile_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbac_assignments_read ON public.rbac_profile_assignments;
CREATE POLICY rbac_assignments_read ON public.rbac_profile_assignments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS rbac_assignments_write ON public.rbac_profile_assignments;
CREATE POLICY rbac_assignments_write ON public.rbac_profile_assignments
  FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_org_tier(org_id, 'admin') AND public.org_unlocks_custom_roles(org_id))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_org_tier(org_id, 'admin') AND public.org_unlocks_custom_roles(org_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_profile_assignments TO authenticated;
REVOKE ALL ON public.rbac_profile_assignments FROM anon;

DO $$ BEGIN
  RAISE NOTICE '205_rbac_v2_assignments: profile assignments table live.';
END $$;

COMMIT;