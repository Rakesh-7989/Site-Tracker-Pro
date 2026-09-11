-- SiteTrack Pro — 265 — fix inventory direction values in _material_stockout_rows (263 bug).
--
-- Migration 263 computed 1.3 material stock-out risk with TWO wrong predicates:
--   • stock      : `direction = 'in'`   → matches ZERO rows (live CHECK allows
--                  only 'inward'/'outward'/'return'/'wastage' — see 01_schema.sql)
--                  → stock always ≤ 0 → EVERY material flagged stockout_critical.
--   • consumption: `direction <> 'in'` → counts ALL non-'in' rows (return +
--                  wastage creep the 14-day run-rate) instead of outward use.
--
-- This migration re-creates the helper with the CORRECT ledger semantics that
-- mirror the client-side references:
--   • stock        := Σ (direction in ('inward','return') ? qty : −qty)
--                    — matches financeQueries.ts sign logic (inward + returned
--                      surplus = stock-in; outward/wastage = stock-out).
--   • consumption  := Σ qty where direction = 'outward' over the trailing 14 days
--                    — matches aiForecast.ts (consumption = outward only) and
--                      the documented "last-14-day outward × 30/14" formula.
--
-- CREATE OR REPLACE is signature-identical (RETURNS TABLE unchanged), so no
-- db:types regeneration and no grant changes (264's ACL survives — function ACLs
-- persist across REPLACE; PUBLIC stays revoked on the helper).

create or replace function public._material_stockout_rows(p_project_id uuid)
returns table (
  material            text,
  unit                text,
  current_stock       numeric,
  monthly_consumption numeric,
  lead_days           integer,
  days_remaining      numeric,
  stockout_critical   boolean
) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today    date := (now() at time zone 'Asia/Kolkata')::date;
  v_org      uuid;
  v_m        record;
  v_stock    numeric := 0;
  v_out14    numeric := 0;
  v_monthly  numeric := 0;
  v_lead     integer := 14;
  v_days     numeric;
begin
  select prj.org_id into v_org from public.projects prj where prj.id = p_project_id;
  if v_org is null then
    return;
  end if;

  for v_m in
    select t.material, coalesce(t.unit, 'nos') as unit
    from public.inventory_transactions t
    where t.project_id = p_project_id
      and t.material is not null
      and t.material <> ''
    group by t.material, coalesce(t.unit, 'nos')
    order by t.material
  loop
    select coalesce(sum(case when t2.direction in ('inward','return') then t2.qty else -t2.qty end), 0)
      into v_stock
      from public.inventory_transactions t2
      where t2.project_id = p_project_id
        and lower(t2.material) = lower(v_m.material);

    select coalesce(sum(t3.qty), 0)
      into v_out14
      from public.inventory_transactions t3
      where t3.project_id = p_project_id
        and lower(t3.material) = lower(v_m.material)
        and t3.direction = 'outward'
        and t3.txn_date >= (v_today - 14);

    v_monthly := round((v_out14::numeric / 14.0) * 30.0, 2);

    -- Lead time: min non-rejected org quote lead_days matching the material
    -- name (project-specific or org-wide); fallback 14 days.
    select coalesce(min(q.lead_days) filter (where q.lead_days is not null), 14)::int
      into v_lead
      from public.procurement_quotes q
      where q.org_id = v_org
        and q.status <> 'rejected'
        and (q.project_id is null or q.project_id = p_project_id)
        and q.item_name is not null
        and lower(q.item_name) like '%' || lower(v_m.material) || '%';

    if v_stock <= 0 then
      v_days := 0;
    elsif v_monthly > 0 then
      v_days := round((v_stock / v_monthly) * 30.0, 1);
    else
      v_days := null;
    end if;

    material := v_m.material;
    unit := v_m.unit;
    current_stock := v_stock;
    monthly_consumption := v_monthly;
    lead_days := coalesce(v_lead, 14);
    days_remaining := v_days;
    stockout_critical :=
      v_days is not null and (v_days <= 14 or v_days <= coalesce(v_lead, 14));
    return next;
  end loop;
end $$;

do $$ begin
  raise notice '265: _material_stockout_rows direction predicates fixed (inward/return = stock-in, outward = consumption)';
end $$;

COMMIT;