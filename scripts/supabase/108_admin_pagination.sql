-- SiteTrack Pro — migration 108: server-side pagination + search for the
-- platform admin lists (2026-06-09). Follow-up to the 100-org scale audit.
--
-- platform_orgs / platform_users / list_upgrade_requests previously returned
-- EVERY row and the UI filtered client-side. At 100 orgs / 500 users that means
-- a big JSON payload + O(n) in-browser search on every keystroke. This adds
-- (p_limit, p_offset, p_search) so the DB does the slicing + filtering.
--
-- All new params have DEFAULTs so existing 0/1-arg callers keep working while we
-- migrate the frontend. DROP+CREATE because the parameter list changes (identity).
-- IDEMPOTENT.

BEGIN;

-- ── platform_orgs(limit, offset, search) ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.platform_orgs();
DROP FUNCTION IF EXISTS public.platform_orgs(int, int, text);
CREATE FUNCTION public.platform_orgs(p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, slug text, plan text, member_count int, project_count int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug, o.plan,
         COALESCE(mc.c, 0)::int AS member_count,
         COALESCE(pc.c, 0)::int AS project_count,
         o.created_at
  FROM public.organizations o
  LEFT JOIN (
    SELECT org_id, count(*) AS c FROM public.org_members WHERE removed_at IS NULL GROUP BY org_id
  ) mc ON mc.org_id = o.id
  LEFT JOIN (
    SELECT org_id, count(*) AS c FROM public.projects GROUP BY org_id
  ) pc ON pc.org_id = o.id
  WHERE public.is_superadmin()
    AND (p_search IS NULL OR p_search = ''
         OR o.name ILIKE '%' || p_search || '%'
         OR o.slug ILIKE '%' || p_search || '%')
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200)) OFFSET GREATEST(0, p_offset);
$$;
GRANT EXECUTE ON FUNCTION public.platform_orgs(int, int, text) TO authenticated;
COMMENT ON FUNCTION public.platform_orgs(int, int, text) IS 'Superadmin: paged + searchable org list (member/project counts). Empty for non-superadmin.';

-- ── platform_users(limit, offset, search) ────────────────────────────────────
DROP FUNCTION IF EXISTS public.platform_users(int);
DROP FUNCTION IF EXISTS public.platform_users(int, int, text);
CREATE FUNCTION public.platform_users(p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, email text, role text, is_staff boolean, org_count int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, pr.name, u.email::text, pr.role, COALESCE(pr.is_staff, false),
         (SELECT count(*)::int FROM public.org_members om WHERE om.profile_id = pr.id AND om.removed_at IS NULL),
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
COMMENT ON FUNCTION public.platform_users(int, int, text) IS 'Superadmin: paged + searchable user list (profile + email + org count). Empty for non-superadmin.';

-- ── list_upgrade_requests(limit, offset) ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.list_upgrade_requests();
DROP FUNCTION IF EXISTS public.list_upgrade_requests(int, int);
CREATE FUNCTION public.list_upgrade_requests(p_limit int DEFAULT 100, p_offset int DEFAULT 0)
RETURNS TABLE (
  id uuid, org_id uuid, org_name text, requester_email text, current_plan text,
  desired_plan text, note text, status text, assigned_staff_id uuid,
  assigned_email text, resolution_note text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.org_id, o.name,
         (SELECT email FROM auth.users WHERE id = r.requested_by),
         r.current_plan, r.desired_plan, r.note, r.status, r.assigned_staff_id,
         (SELECT email FROM auth.users WHERE id = r.assigned_staff_id),
         r.resolution_note, r.created_at, r.updated_at
  FROM public.plan_upgrade_requests r
  JOIN public.organizations o ON o.id = r.org_id
  WHERE public.is_staff_head_or_owner() OR r.assigned_staff_id = auth.uid()
  ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, r.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500)) OFFSET GREATEST(0, p_offset);
$$;
GRANT EXECUTE ON FUNCTION public.list_upgrade_requests(int, int) TO authenticated;
COMMENT ON FUNCTION public.list_upgrade_requests(int, int) IS 'Staff (owner/head all; member assigned): paged upgrade-request queue.';

COMMIT;
