-- SiteTrack Pro — org-admin panel read RPCs (2026-06-05).
--
-- The v3 org-admin section (dashboard / billing / activity) needs org-scoped
-- aggregate reads. Rather than wrestle the GRANT/RLS backstop on each base
-- table, we expose SECURITY DEFINER RPCs gated by has_org_tier(org,'admin')
-- OR is_superadmin() — same pattern as migration 71's list_org_members.
--
-- Read-only. No writes. IDEMPOTENT.

BEGIN;

-- ── Org overview: name, plan, counts, subscription snapshot ────────────────
CREATE OR REPLACE FUNCTION public.org_admin_overview(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (public.is_superadmin() OR public.has_org_tier(p_org, 'admin')) THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
    'name', o.name,
    'slug', o.slug,
    'plan', o.plan,
    'projectCount', (SELECT count(*) FROM public.projects WHERE org_id = p_org),
    'memberCount',  (SELECT count(*) FROM public.org_members WHERE org_id = p_org),
    'createdAt', o.created_at,
    'sub', (
      SELECT jsonb_build_object(
        'provider', s.provider, 'status', s.status, 'plan', s.plan,
        'currentPeriodEnd', s.current_period_end, 'trialEndsAt', s.trial_ends_at
      ) FROM public.subscriptions s WHERE s.org_id = p_org
    )
  ) INTO result
  FROM public.organizations o WHERE o.id = p_org;
  RETURN result;
END $$;

-- ── Org activity: audit log scoped to one org (most recent first) ───────────
CREATE OR REPLACE FUNCTION public.list_org_activity(p_org uuid, p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, actor_name text, actor_role text, action text,
  resource text, resource_id text, message text, ts timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.actor_name, a.actor_role, a.action,
         a.resource, a.resource_id, a.message, a.ts
  FROM public.audit_log_v2 a
  WHERE a.org_id = p_org
    AND (public.is_superadmin() OR public.has_org_tier(p_org, 'admin'))
  ORDER BY a.ts DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.org_admin_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_org_activity(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.org_admin_overview(uuid) IS
  'v3 org-admin dashboard/billing: org name+plan+counts+subscription. Null unless caller is org admin or superadmin.';
COMMENT ON FUNCTION public.list_org_activity(uuid, int) IS
  'v3 org-admin activity panel: audit_log_v2 rows for one org. Empty unless caller is org admin or superadmin.';

COMMIT;
