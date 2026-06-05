-- SiteTrack Pro — org-admin People module support (HRMS Phase B, 2026-06-04).
--
-- Gives org admins (org_members.role='admin') a clean, RLS-safe way to manage
-- the people in their org: list members, look up a user by email to add, and
-- write org_members rows. Reads go through SECURITY DEFINER RPCs so we don't
-- have to widen profiles RLS (which would leak names cross-org).
--
--   org_members_admin_write   — policy: org admin can write org_members in own org
--   list_org_members(org_id)   — RPC: member directory for an org (admin-guarded)
--   lookup_user_for_invite(em) — RPC: find an EXISTING account by email to add
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. Modern admin write policy (additive; uses has_org_tier from mig 66) ──
-- Permissive policies are OR-combined, so this broadens write access to any
-- active org-tier admin without depending on the legacy user_org_id() helper.
DROP POLICY IF EXISTS org_members_admin_write ON public.org_members;
CREATE POLICY org_members_admin_write ON public.org_members
  FOR ALL
  USING (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'))
  WITH CHECK (public.is_superadmin() OR public.has_org_tier(org_id, 'admin'));

-- ── 2. list_org_members — member directory for one org ──────────────────────
-- Returns the joined member list + each member's active custom-role labels.
-- Guarded INSIDE the query: non-admins of the org get zero rows.
CREATE OR REPLACE FUNCTION public.list_org_members(p_org_id uuid)
RETURNS TABLE (
  profile_id    uuid,
  name          text,
  identity_role text,
  org_role      text,
  joined_at     timestamptz,
  removed_at    timestamptz,
  custom_roles  text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    om.profile_id,
    p.name,
    p.role,
    om.role,
    om.joined_at,
    om.removed_at,
    COALESCE((
      SELECT array_agg(r.label ORDER BY r.label)
      FROM public.org_member_roles mr
      JOIN public.org_roles r ON r.id = mr.org_role_id
      WHERE mr.org_id = p_org_id AND mr.profile_id = om.profile_id AND mr.removed_at IS NULL
    ), '{}'::text[]) AS custom_roles
  FROM public.org_members om
  JOIN public.profiles p ON p.id = om.profile_id
  WHERE om.org_id = p_org_id
    AND (public.is_superadmin() OR public.has_org_tier(p_org_id, 'admin'))
  ORDER BY (om.removed_at IS NOT NULL), p.name;
$$;

COMMENT ON FUNCTION public.list_org_members(uuid) IS
  'Member directory for an org (name, identity role, org tier, custom-role labels, status). Returns rows only to an active org admin of that org or a superadmin.';

GRANT EXECUTE ON FUNCTION public.list_org_members(uuid) TO authenticated;

-- ── 3. lookup_user_for_invite — find an EXISTING account by email ───────────
-- Org admin enters an email to add someone who already has a SiteTrack
-- account. (Brand-new-user email invites = a later Edge Function.) Guarded so
-- only org admins / superadmin can probe.
CREATE OR REPLACE FUNCTION public.lookup_user_for_invite(p_email text)
RETURNS TABLE (profile_id uuid, name text, identity_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.id, p.name, p.role
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
    AND (
      public.is_superadmin()
      OR EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.profile_id = auth.uid() AND om.role = 'admin' AND om.removed_at IS NULL
      )
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.lookup_user_for_invite(text) IS
  'Find an EXISTING account by email so an org admin can add them to the org. Returns nothing unless the caller is an org admin or superadmin.';

GRANT EXECUTE ON FUNCTION public.lookup_user_for_invite(text) TO authenticated;

COMMIT;
