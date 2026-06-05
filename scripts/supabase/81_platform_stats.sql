-- SiteTrack Pro — platform dashboard stats RPC (2026-06-06).
-- One superadmin-gated aggregate for the /admin home. Read-only. IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_superadmin() THEN jsonb_build_object(
    'orgCount',       (SELECT count(*) FROM public.organizations),
    'userCount',      (SELECT count(*) FROM public.profiles),
    'projectCount',   (SELECT count(*) FROM public.projects),
    'staffCount',     (SELECT count(*) FROM public.profiles WHERE is_staff = true),
    'pendingSignups', (SELECT count(*) FROM public.signup_requests WHERE status = 'pending'),
    'approvedSignups',(SELECT count(*) FROM public.signup_requests WHERE status = 'approved'),
    'plans', COALESCE((SELECT jsonb_object_agg(plan, c) FROM (
                SELECT plan, count(*) AS c FROM public.organizations GROUP BY plan) t), '{}'::jsonb)
  ) ELSE NULL END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_stats() TO authenticated;
COMMENT ON FUNCTION public.platform_stats() IS 'Superadmin platform dashboard aggregates (counts + plan breakdown). Null for non-superadmin.';

COMMIT;
