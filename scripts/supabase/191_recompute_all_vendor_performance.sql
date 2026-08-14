-- SiteTrack Pro — C3 RPC audit fix: implement recompute_all_vendor_performance.
-- Run AFTER 190_drift_fix_columns.sql. Idempotent.
--
-- Migration 178 commented this function out ("DISABLED due to uuid[] issue"),
-- but the frontend still calls it (VendorScorecardView "Recompute All" →
-- advancedProcurementQueries.recomputeAllVendorPerformance), so every click
-- failed with PGRST202. The original disabled body also had a real bug: it
-- passed the 5 args positionally as
--   (id, org_id, project_id, period_start, period_end)
-- which mapped project_id (uuid) into p_period_start (date) → type error.
-- This version calls recompute_vendor_performance with the period args in the
-- correct slots and grants EXECUTE to authenticated (matching the caller).

create or replace function public.recompute_all_vendor_performance(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor record;
  v_period_start date := date_trunc('month', now() - interval '1 month')::date;
  v_period_end date := (date_trunc('month', now())::date - 1);
begin
  for v_vendor in
    select distinct v.id as vendor_id, p.org_id as org_id, po.project_id
    from public.vendors v
    join public.purchase_orders po on po.vendor_id = v.id
    join public.projects p on p.id = po.project_id
    where p.org_id = p_org_id
  loop
    perform public.recompute_vendor_performance(
      v_vendor.vendor_id, v_vendor.org_id,
      v_period_start, v_period_end,
      v_vendor.project_id
    );
  end loop;
end;
$$;

grant execute on function public.recompute_all_vendor_performance(uuid) to authenticated;
revoke execute on function public.recompute_all_vendor_performance(uuid) from public, anon;

do $$ begin
  raise notice 'recompute_all_vendor_performance present: %',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'recompute_all_vendor_performance');
end $$;
