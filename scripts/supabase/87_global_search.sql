-- SiteTrack Pro — global search RPC (2026-06-06).
-- Cross-entity search (projects / vendors / milestones / tasks) scoped to the
-- caller's orgs (or all, for superadmin). SECURITY DEFINER. Read-only.
-- IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.global_search(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (kind text, id uuid, project_id uuid, label text, sublabel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    SELECT 'project'::text AS kind, p.id, p.id AS project_id, p.name AS label, COALESCE(p.location, '') AS sublabel
    FROM public.projects p
    WHERE (public.is_superadmin() OR p.org_id = ANY(public.user_org_ids())) AND p.name ILIKE '%' || p_query || '%'
    UNION ALL
    SELECT 'vendor', v.id, NULL::uuid, v.name, COALESCE(v.category, '')
    FROM public.vendors v
    WHERE (public.is_superadmin() OR v.org_id = ANY(public.user_org_ids())) AND v.name ILIKE '%' || p_query || '%'
    UNION ALL
    SELECT 'milestone', m.id, m.project_id, m.title, p.name
    FROM public.milestones m JOIN public.projects p ON p.id = m.project_id
    WHERE (public.is_superadmin() OR p.org_id = ANY(public.user_org_ids())) AND m.title ILIKE '%' || p_query || '%'
    UNION ALL
    SELECT 'task', t.id, t.project_id, t.title, p.name
    FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
    WHERE (public.is_superadmin() OR p.org_id = ANY(public.user_org_ids())) AND t.title ILIKE '%' || p_query || '%'
  ) s
  WHERE length(trim(p_query)) >= 2
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text, int) TO authenticated;
COMMENT ON FUNCTION public.global_search(text, int) IS 'Cross-entity search scoped to the caller''s orgs (projects/vendors/milestones/tasks).';

COMMIT;
