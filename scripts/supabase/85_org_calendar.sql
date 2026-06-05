-- SiteTrack Pro — org calendar RPC (2026-06-06).
-- Unified dated items (milestones + tasks) across all of an org's projects, for
-- the /calendar view. SECURITY DEFINER + manual org-membership gate. Read-only.
-- IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_calendar(p_org uuid)
RETURNS TABLE (kind text, id uuid, project_id uuid, project_name text, title text, due_date date, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'milestone'::text, m.id, m.project_id, p.name, m.title, m.due_date, m.status
  FROM public.milestones m JOIN public.projects p ON p.id = m.project_id
  WHERE p.org_id = p_org AND m.due_date IS NOT NULL
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  UNION ALL
  SELECT 'task'::text, t.id, t.project_id, p.name, t.title, t.due_date, t.status
  FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
  WHERE p.org_id = p_org AND t.due_date IS NOT NULL
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  ORDER BY due_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.org_calendar(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_calendar(uuid) IS 'Dated milestones + tasks across an org''s projects (calendar). Empty for non-members.';

COMMIT;
