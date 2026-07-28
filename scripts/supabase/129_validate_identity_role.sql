-- SiteTrack Pro — add identity role validation to set_member_identity_role RPC.
--
-- Problem: set_member_identity_role accepts ANY text for p_role. If an invalid
-- value (empty string, org-tier role like "admin", etc.) is passed, the raw
-- profiles_role_check constraint violation surfaces to the client as an opaque 500.
--
-- This migration adds an explicit VALIDATION guard in the RPC that returns a
-- clear error message before the UPDATE hits the constraint.
--
-- Also adds a VALIDATION guard in invite_member EF companion (handled in TS).
-- THIS migration only covers the RPC path.
--
-- IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_member_identity_role(
  p_profile_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'permission-denied';
  END IF;

  IF p_role IS NULL OR p_role = '' THEN
    RAISE EXCEPTION 'invalid-identity-role: role must not be empty';
  END IF;

  IF p_role NOT IN (
    'superadmin','orgadmin','promoter','project_admin','prospector','pm',
    'architect','senior_architect','junior_architect','design_architect_interior',
    'design_head','consultant_head','mep_consultant','structural_consultant',
    'consultant','designer','site_engineer','site_inspector',
    'contractor','sub_contractor','vendor','client'
  ) THEN
    RAISE EXCEPTION 'invalid-identity-role: "%" is not a valid identity role', p_role;
  END IF;

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile-not-found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_member_identity_role(uuid, text) IS
  'Updates a member identity role (profiles.role) with input validation. Caller must be superadmin or an active org-tier admin of an org. SECURITY DEFINER — bypasses RLS on profiles.';

GRANT EXECUTE ON FUNCTION public.set_member_identity_role(uuid, text) TO authenticated;

COMMIT;
