-- SiteTrack Pro — platform (superadmin) read RPCs (2026-06-06).
--
-- The v3 super-admin panels (/admin/orgs, /admin/users) need cross-tenant
-- aggregate reads. Exposed as SECURITY DEFINER RPCs gated to is_superadmin()
-- (same pattern as the org-admin RPCs). Read-only. IDEMPOTENT.

BEGIN;

-- All organizations with member + project counts.
CREATE OR REPLACE FUNCTION public.platform_orgs()
RETURNS TABLE (id uuid, name text, slug text, plan text, member_count int, project_count int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug, o.plan,
    (SELECT count(*)::int FROM public.org_members om WHERE om.org_id = o.id),
    (SELECT count(*)::int FROM public.projects p WHERE p.org_id = o.id),
    o.created_at
  FROM public.organizations o
  WHERE public.is_superadmin()
  ORDER BY o.created_at DESC;
$$;

-- All users (profiles + auth email) with org membership count.
CREATE OR REPLACE FUNCTION public.platform_users(p_limit int DEFAULT 200)
RETURNS TABLE (id uuid, name text, email text, role text, is_staff boolean, org_count int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, pr.name, u.email::text, pr.role, COALESCE(pr.is_staff, false),
    (SELECT count(*)::int FROM public.org_members om WHERE om.profile_id = pr.id),
    pr.created_at
  FROM public.profiles pr
  LEFT JOIN auth.users u ON u.id = pr.id
  WHERE public.is_superadmin()
  ORDER BY pr.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

GRANT EXECUTE ON FUNCTION public.platform_orgs()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_users(int)   TO authenticated;

COMMENT ON FUNCTION public.platform_orgs() IS 'Superadmin: all orgs + member/project counts. Empty for non-superadmin.';
COMMENT ON FUNCTION public.platform_users(int) IS 'Superadmin: all users (profile + email) + org count. Empty for non-superadmin.';

COMMIT;
