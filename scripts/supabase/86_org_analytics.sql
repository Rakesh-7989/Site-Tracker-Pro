-- SiteTrack Pro — org analytics aggregate RPC (2026-06-06).
-- One superadmin/member-gated jsonb of org-wide rollups for the /analytics view.
-- Read-only. IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_analytics(p_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_superadmin() OR p_org = ANY(public.user_org_ids()) THEN jsonb_build_object(
    'projectCount', (SELECT count(*) FROM public.projects WHERE org_id = p_org),
    'projectsByStatus', COALESCE((SELECT jsonb_object_agg(s, c) FROM
        (SELECT status s, count(*) c FROM public.projects WHERE org_id = p_org GROUP BY status) q), '{}'::jsonb),
    'totalBudget', COALESCE((SELECT sum(budget) FROM public.projects WHERE org_id = p_org), 0),
    'avgProgress', COALESCE((SELECT round(avg(progress)) FROM public.projects WHERE org_id = p_org), 0),
    'milestoneStatus', COALESCE((SELECT jsonb_object_agg(s, c) FROM
        (SELECT m.status s, count(*) c FROM public.milestones m JOIN public.projects p ON p.id = m.project_id
         WHERE p.org_id = p_org GROUP BY m.status) q), '{}'::jsonb),
    'taskStatus', COALESCE((SELECT jsonb_object_agg(s, c) FROM
        (SELECT t.status s, count(*) c FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
         WHERE p.org_id = p_org GROUP BY t.status) q), '{}'::jsonb),
    'finance', jsonb_build_object(
      'poTotal',      COALESCE((SELECT sum(po.amount)      FROM public.purchase_orders po JOIN public.projects p ON p.id = po.project_id WHERE p.org_id = p_org), 0),
      'invoiceTotal', COALESCE((SELECT sum(i.amount)       FROM public.invoices i        JOIN public.projects p ON p.id = i.project_id  WHERE p.org_id = p_org), 0),
      'raBillTotal',  COALESCE((SELECT sum(r.bill_amount)  FROM public.ra_bills r         JOIN public.projects p ON p.id = r.project_id  WHERE p.org_id = p_org), 0)
    )
  ) ELSE NULL END;
$$;

GRANT EXECUTE ON FUNCTION public.org_analytics(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_analytics(uuid) IS 'Org-wide rollups (projects/milestones/tasks/finance). Null for non-members.';

COMMIT;
