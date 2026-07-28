-- SiteTrack Pro — SECURITY DEFINER RPC for org admins to update member identity roles.
--
-- Problem: profiles table has NO UPDATE RLS policy. When an org admin tries to
-- update a member's identity role via the client SDK (setIdentityRole()), RLS
-- blocks it because the caller ≠ auth.uid() of the target profile.
--
-- This RPC bypasses RLS (SECURITY DEFINER) but still authorizes: only
-- superadmin or an active org admin of the SAME org can call it.
--
-- Steps:
--   1. Verify caller is superadmin OR an active org-tier admin of the org.
--   2. Set the new identity role on the target profile.
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

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile-not-found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_member_identity_role(uuid, text) IS
  'Updates a member identity role (profiles.role). Caller must be superadmin or an active org-tier admin of an org. SECURITY DEFINER — bypasses RLS on profiles.';

GRANT EXECUTE ON FUNCTION public.set_member_identity_role(uuid, text) TO authenticated;

COMMIT;
