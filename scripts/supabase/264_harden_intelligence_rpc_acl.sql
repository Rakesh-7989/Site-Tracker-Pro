-- SiteTrack Pro — 264 — harden EXECUTE ACLs for migration 263 functions.
--
-- PostgreSQL grants function EXECUTE to PUBLIC by default. The un-gated
-- SECURITY DEFINER helpers added in 263 (_cost_forecast_row /
-- _labour_metrics_row / _material_stockout_rows) are pure project-scoped
-- reads with NO in-function gate, so the default PUBLIC privilege would have
-- let any authenticated/anon client read any project's forecast / labour /
-- material intelligence — a cross-tenant read hole.
--
-- This migration locks the helpers to the owning role (postgres, used by
-- pg_cron + the gated RPCs), pins the cron wrappers to service_role, and pins
-- the on-demand RPCs to authenticated (their in-function org gates remain the
-- real authorization). 263 stays immutable (ledger checksum).

BEGIN;

-- Un-gated helpers: owner-only (their callers run definer as postgres).
revoke execute on function public._cost_forecast_row(uuid) from public;
revoke execute on function public._labour_metrics_row(uuid) from public;
revoke execute on function public._material_stockout_rows(uuid) from public;

-- Cron wrappers are batch recomputes for every project: service_role only.
revoke execute on function public.compute_all_cost_forecasts() from public;
revoke execute on function public.compute_all_labour_metrics() from public;
grant execute on function public.compute_all_cost_forecasts() to service_role;
grant execute on function public.compute_all_labour_metrics() to service_role;

-- On-demand RPCs carry in-function org-admin / can_read_project gates:
-- authenticated only (no anon, no PUBLIC).
revoke execute on function public.compute_cost_forecast(uuid) from public;
revoke execute on function public.compute_labour_metrics(uuid) from public;
revoke execute on function public.compute_material_stockout(uuid) from public;
revoke execute on function public.compute_org_material_stockout(uuid) from public;
grant execute on function public.compute_cost_forecast(uuid) to authenticated;
grant execute on function public.compute_labour_metrics(uuid) to authenticated;
grant execute on function public.compute_material_stockout(uuid) to authenticated;
grant execute on function public.compute_org_material_stockout(uuid) to authenticated;

do $$ begin
  raise notice '264: 263 EXECUTE ACLs tightened (helpers owner-only, wrappers service_role, RPCs authenticated)';
end $$;

COMMIT;