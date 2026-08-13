-- SiteTrack Pro — migration 184: platform_users — active-membership org_count
-- + staff_tier (2026-08-13). Follow-up to 108 (server-side pagination) and
-- 173 (org_members.status).
--
-- org_count previously counted every membership with removed_at IS NULL,
-- ignoring the migration-173 `status` column — invited / removed rows inflated
-- the count. Also surface profiles.staff_tier (migration 99) so the Users
-- screen can show the platform staff hierarchy.
--
-- DROP+CREATE because the RETURN TABLE identity changes. IDEMPOTENT.

BEGIN;

DROP FUNCTION IF EXISTS public.platform_users(int);
DROP FUNCTION IF EXISTS public.platform_users(int, int, text);
CREATE FUNCTION public.platform_users(p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, email text, role text, is_staff boolean, staff_tier text, org_count int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, pr.name, u.email::text, pr.role, COALESCE(pr.is_staff, false), pr.staff_tier,
         (SELECT count(*)::int FROM public.org_members om
          WHERE om.profile_id = pr.id AND om.removed_at IS NULL AND om.status = 'active'),
         pr.created_at
  FROM public.profiles pr
  LEFT JOIN auth.users u ON u.id = pr.id
  WHERE public.is_superadmin()
    AND (p_search IS NULL OR p_search = ''
         OR pr.name ILIKE '%' || p_search || '%'
         OR u.email ILIKE '%' || p_search || '%')
  ORDER BY pr.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200)) OFFSET GREATEST(0, p_offset);
$$;
GRANT EXECUTE ON FUNCTION public.platform_users(int, int, text) TO authenticated;
COMMENT ON FUNCTION public.platform_users(int, int, text) IS 'Superadmin: paged + searchable user list (active-membership org count + staff tier). Empty for non-superadmin.';

COMMIT;