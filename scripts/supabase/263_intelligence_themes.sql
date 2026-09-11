-- SiteTrack Pro — Pillar 1.2 / 1.3 / 1.4 intelligence themes (v5 Pillar 1 follow-ups).
--
-- Ships three read-only intelligence surfaces on top of the existing ops data:
--
--   1.2 cost_forecast — per-project monthly cost-overrun forecast. A cron job
--       projects each active project's monthly burn (least-squares regression
--       over the last 3 complete months of actuals: expenses + PO receipts +
--       paid RA bills) over the remaining months to expected_end_date (fallback
--       12) and stores projected_spend / projected_overrun / confidence.
--       On-demand recompute for an org-admin (compute_cost_forecast(p_project_id))
--       re-runs the same math immediately (e.g. right after a budget edit).
--
--   1.3 material stock-out prediction — member-gated, read-only, no cron:
--       compute_material_stockout(p_project_id) / compute_org_material_stockout(p_org_id)
--       compute per (project, material): current stock (Σ in − out), a
--       monthly consumption run-rate (last-14-day outward × 30/14), the
--       procurement lead time (min non-rejected org quote lead_days matching the
--       material name, fallback 14), and days_remaining; a row is stockout-critical
--       when days_remaining ≤ 14 or ≤ lead_days.
--
--   1.4 labour_metrics — per-project weekly snapshots of present/scheduled
--       attendance_rate (shift_roster as the schedule), overtime_ratio (Σ OT /
--       Σ hours), labour_hours, labour_cost (Σ labour_register.wage × present
--       days). Output-unit columns (output_units / units_per_labour_day /
--       cost_per_unit) stay nullable — the measurement-sheet source does not
--       exist yet (founder decision 2026-09-11: ship without units). Cron runs
--       Sunday 23:30 UTC for the just-completed ISO week; org-admin recompute
--       via compute_labour_metrics(p_project_id).
--
-- Security posture mirrors migration 225: tables have read-only RLS
-- (can_read_project), no DML grants to authenticated — all writes flow through
-- SECURITY DEFINER functions owned by postgres (cron runs as postgres; the
-- on-demand RPCs are org-admin gated). Helper functions are un-granted
-- (internal only).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. cost_forecast
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.cost_forecast (
  project_id         uuid not null references public.projects(id)
                       on update cascade on delete cascade,
  forecast_month     date not null,
  projected_spend    numeric not null default 0 check (projected_spend >= 0),
  projected_overrun  numeric not null default 0 check (projected_overrun >= 0),
  confidence         numeric(5,2) not null default 0
                       check (confidence >= 0 and confidence <= 1),
  computed_at        timestamptz not null default now(),
  primary key (project_id, forecast_month)
);

alter table public.cost_forecast enable row level security;

drop policy if exists cost_forecast_read on public.cost_forecast;
create policy cost_forecast_read on public.cost_forecast
  for select
  using (public.can_read_project(project_id));

grant select on public.cost_forecast to authenticated;
revoke all on public.cost_forecast from anon;
-- No DML grants: writes stay definer-only (cron OR org-admin RPC).

-- Helper (un-gated; called only from cron wrapper + org-admin RPC)
create or replace function public._cost_forecast_row(v_project_id uuid)
returns table (
  project_id        uuid,
  forecast_month    date,
  projected_spend   numeric,
  projected_overrun numeric,
  confidence        numeric
) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today      date := (now() at time zone 'Asia/Kolkata')::date;
  v_ref        date;
  v_budget     numeric;
  v_end        date;
  v_spent      numeric := 0;
  v_remaining  numeric := 0;
  v_months     integer := 12;
  v_vals       numeric[] := '{}'::numeric[];
  v_m_total    numeric := 0;
  v_n          integer := 0;
  v_i          integer;
  v_ms         date;
  v_me         date;
  v_sy         numeric := 0;
  v_sxy        numeric := 0;
  v_nz_sum     numeric := 0;
  v_slope      numeric := 0;
  v_burn       numeric := 0;
  v_projected  numeric := 0;
  v_overrun    numeric := 0;
  v_confidence numeric := 0.2;
begin
  select prj.budget, prj.expected_end_date
    into v_budget, v_end
    from public.projects prj
    where prj.id = v_project_id;
  if not found then
    return;
  end if;

  select coalesce(sum(e.amount), 0)
    into v_spent
    from public.expenses e
    where e.project_id = v_project_id
      and coalesce(e.status, '') not in ('rejected', 'cancelled');

  v_remaining := greatest(0, coalesce(v_budget, 0) - v_spent);
  v_ref := date_trunc('month', v_today)::date;

  -- Monthly actuals for the previous 3 complete calendar months.
  for v_i in 1..3 loop
    v_ms := (v_ref - ((v_i - 1) * interval '1 month'))::date;
    v_me := (v_ms + interval '1 month' - interval '1 day')::date;
    select
        coalesce((
          (select coalesce(sum(e.amount), 0) from public.expenses e
            where e.project_id = v_project_id
              and e.expense_date between v_ms and v_me
              and coalesce(e.status, '') not in ('rejected', 'cancelled'))
          + (select coalesce(sum(r.amount), 0) from public.po_receipts r
              join public.purchase_orders po on po.id = r.po_id
              where po.project_id = v_project_id
                and r.received_date between v_ms and v_me)
          + (select coalesce(sum(rb.paid_amount), 0) from public.ra_bills rb
              where rb.project_id = v_project_id
                and coalesce(rb.status, '') = 'paid'
                and coalesce(rb.bill_date, rb.updated_at)::date between v_ms and v_me)
        ), 0)
      into v_m_total;
    v_vals := array_append(v_vals, v_m_total);
    if v_m_total > 0 then
      v_n := v_n + 1;
    end if;
  end loop;

  -- Least-squares fit over the 3 windows (x = 1,2,3), then forward-project the
  -- next month's spend level: burn = avg + 2·slope (clamped ≥ 0). Fallback to
  -- the observed average when history has fewer than 2 months of activity.
  for v_i in 1..array_length(v_vals, 1) loop
    v_sy := v_sy + v_vals[v_i];
    v_sxy := v_sxy + (v_i::numeric * v_vals[v_i]);
    if v_vals[v_i] > 0 then
      v_nz_sum := v_nz_sum + v_vals[v_i];
    end if;
  end loop;
  if v_n >= 2 then
    -- slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²); n=3, Σx=6, Σx²=14
    v_slope := (3 * v_sxy - 6 * v_sy) / (3 * 14 - 36);
    v_burn := greatest(0, (v_sy / 3.0) + 2 * v_slope);
  elsif v_n = 1 then
    v_burn := v_nz_sum;
  else
    v_burn := 0;
  end if;

  if v_end is not null and v_end > v_today then
    v_months := greatest(1, ceil((v_end - v_today) / 30.0)::int);
  end if;

  v_projected := v_spent + v_burn * v_months;
  v_overrun := greatest(0, v_burn * v_months - v_remaining);

  v_confidence := case v_n
    when 3 then 0.8
    when 2 then 0.6
    when 1 then 0.4
    else 0.2
  end;

  insert into public.cost_forecast as f
    (project_id, forecast_month, projected_spend, projected_overrun, confidence, computed_at)
  values
    (v_project_id, v_ref, round(v_projected, 2), round(v_overrun, 2), v_confidence, now())
  on conflict (project_id, forecast_month) do update
    set projected_spend    = excluded.projected_spend,
        projected_overrun  = excluded.projected_overrun,
        confidence         = excluded.confidence,
        computed_at        = excluded.computed_at;

  return query select
    v_project_id,
    v_ref,
    round(v_projected, 2),
    round(v_overrun, 2),
    v_confidence;
end $$;

-- On-demand org-admin recompute for a single project.
create or replace function public.compute_cost_forecast(p_project_id uuid)
returns table (
  project_id        uuid,
  forecast_month    date,
  projected_spend   numeric,
  projected_overrun numeric,
  confidence        numeric
) language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select prj.org_id into v_org from public.projects prj where prj.id = p_project_id;
  if v_org is null then
    raise exception 'project not found';
  end if;
  if not (public.is_superadmin() or public.has_org_tier(v_org, 'admin')) then
    raise exception 'insufficient privileges';
  end if;
  return query select f.* from public._cost_forecast_row(p_project_id) f;
end $$;

-- Cron wrapper: forecast every non-terminal, non-archived project.
create or replace function public.compute_all_cost_forecasts()
returns table (
  project_id        uuid,
  forecast_month    date,
  projected_spend   numeric,
  projected_overrun numeric,
  confidence        numeric
) language plpgsql security definer set search_path = public as $$
declare
  v_proj record;
begin
  for v_proj in
    select prj.id
    from public.projects prj
    where coalesce(prj.status, '') not in ('completed', 'cancelled')
      and prj.archived_at is null
    order by prj.id
  loop
    return query select f.* from public._cost_forecast_row(v_proj.id) f;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. labour_metrics
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.labour_metrics (
  project_id          uuid not null references public.projects(id)
                        on update cascade on delete cascade,
  week_start          date not null,
  attendance_rate     numeric(5,4) not null default 0
                        check (attendance_rate >= 0 and attendance_rate <= 1),
  overtime_ratio      numeric(5,4) not null default 0
                        check (overtime_ratio >= 0),
  labour_hours        numeric not null default 0 check (labour_hours >= 0),
  labour_cost         numeric not null default 0 check (labour_cost >= 0),
  output_units        numeric,
  units_per_labour_day numeric,
  cost_per_unit       numeric,
  computed_at         timestamptz not null default now(),
  primary key (project_id, week_start)
);

alter table public.labour_metrics enable row level security;

drop policy if exists labour_metrics_read on public.labour_metrics;
create policy labour_metrics_read on public.labour_metrics
  for select
  using (public.can_read_project(project_id));

grant select on public.labour_metrics to authenticated;
revoke all on public.labour_metrics from anon;
-- No DML grants: writes stay definer-only (cron OR org-admin RPC).

-- Helper (un-gated; called only from cron wrapper + org-admin RPC)
create or replace function public._labour_metrics_row(v_project_id uuid)
returns table (
  project_id          uuid,
  week_start          date,
  attendance_rate     numeric,
  overtime_ratio      numeric,
  labour_hours        numeric,
  labour_cost         numeric,
  output_units        numeric,
  units_per_labour_day numeric,
  cost_per_unit       numeric
) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_ws        date;
  v_present   integer := 0;
  v_scheduled integer := 0;
  v_hours     numeric := 0;
  v_ot        numeric := 0;
  v_cost      numeric := 0;
  v_rate      numeric := 0;
  v_otr       numeric := 0;
begin
  -- Previous complete ISO week (Monday → Sunday).
  v_ws := (date_trunc('week', v_today) - interval '7 days')::date;

  select count(*)
    into v_present
    from public.attendance a
    where a.project_id = v_project_id
      and a.status = 'present'
      and a.date between v_ws and (v_ws + 6);

  select count(*)
    into v_scheduled
    from public.shift_roster sr
    where sr.project_id = v_project_id
      and sr.shift_date between v_ws and (v_ws + 6);

  select coalesce(sum(a2.hours), 0), coalesce(sum(a2.overtime), 0)
    into v_hours, v_ot
    from public.attendance a2
    where a2.project_id = v_project_id
      and a2.date between v_ws and (v_ws + 6);

  select coalesce(sum(lr.wage * d.days), 0)
    into v_cost
    from public.labour_register lr
    join (
      select a3.labour_id, count(*) as days
      from public.attendance a3
      where a3.project_id = v_project_id
        and a3.labour_id is not null
        and a3.status = 'present'
        and a3.date between v_ws and (v_ws + 6)
      group by a3.labour_id
    ) d on d.labour_id = lr.id
    where lr.project_id = v_project_id;

  v_rate := case
    when v_scheduled > 0 then least(1.0, round(v_present::numeric / v_scheduled::numeric, 4))
    else 0
  end;
  v_otr := case
    when v_hours > 0 then round(v_ot / v_hours, 4)
    else 0
  end;

  insert into public.labour_metrics as l
    (project_id, week_start, attendance_rate, overtime_ratio, labour_hours,
     labour_cost, output_units, units_per_labour_day, cost_per_unit, computed_at)
  values
    (v_project_id, v_ws, v_rate, v_otr, round(v_hours, 2), round(v_cost, 2),
     null, null, null, now())
  on conflict (project_id, week_start) do update
    set attendance_rate  = excluded.attendance_rate,
        overtime_ratio   = excluded.overtime_ratio,
        labour_hours     = excluded.labour_hours,
        labour_cost      = excluded.labour_cost,
        output_units     = null,
        units_per_labour_day = null,
        cost_per_unit    = null,
        computed_at      = excluded.computed_at;

  return query select
    v_project_id, v_ws, v_rate, v_otr, round(v_hours, 2), round(v_cost, 2),
    null::numeric, null::numeric, null::numeric;
end $$;

-- On-demand org-admin recompute for a single project.
create or replace function public.compute_labour_metrics(p_project_id uuid)
returns table (
  project_id          uuid,
  week_start          date,
  attendance_rate     numeric,
  overtime_ratio      numeric,
  labour_hours        numeric,
  labour_cost         numeric,
  output_units        numeric,
  units_per_labour_day numeric,
  cost_per_unit       numeric
) language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select prj.org_id into v_org from public.projects prj where prj.id = p_project_id;
  if v_org is null then
    raise exception 'project not found';
  end if;
  if not (public.is_superadmin() or public.has_org_tier(v_org, 'admin')) then
    raise exception 'insufficient privileges';
  end if;
  return query select f.* from public._labour_metrics_row(p_project_id) f;
end $$;

-- Cron wrapper: roll the just-completed week for every non-terminal project.
create or replace function public.compute_all_labour_metrics()
returns table (
  project_id          uuid,
  week_start          date,
  attendance_rate     numeric,
  overtime_ratio      numeric,
  labour_hours        numeric,
  labour_cost         numeric,
  output_units        numeric,
  units_per_labour_day numeric,
  cost_per_unit       numeric
) language plpgsql security definer set search_path = public as $$
declare
  v_proj record;
begin
  for v_proj in
    select prj.id
    from public.projects prj
    where coalesce(prj.status, '') not in ('completed', 'cancelled')
      and prj.archived_at is null
    order by prj.id
  loop
    return query select f.* from public._labour_metrics_row(v_proj.id) f;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Material stock-out prediction (read-only, member-gated, no cron)
-- ═══════════════════════════════════════════════════════════════════════════
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
    select coalesce(sum(case when t2.direction = 'in' then t2.qty else -t2.qty end), 0)
      into v_stock
      from public.inventory_transactions t2
      where t2.project_id = p_project_id
        and lower(t2.material) = lower(v_m.material);

    select coalesce(sum(t3.qty), 0)
      into v_out14
      from public.inventory_transactions t3
      where t3.project_id = p_project_id
        and lower(t3.material) = lower(v_m.material)
        and t3.direction <> 'in'
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

-- Member-accessible: mirrors the can_read_project RLS on inventory.
create or replace function public.compute_material_stockout(p_project_id uuid)
returns table (
  material            text,
  unit                text,
  current_stock       numeric,
  monthly_consumption numeric,
  lead_days           integer,
  days_remaining      numeric,
  stockout_critical   boolean
) language plpgsql security definer set search_path = public as $$
begin
  if not public.can_read_project(p_project_id) then
    raise exception 'insufficient privileges';
  end if;
  return query select f.* from public._material_stockout_rows(p_project_id) f;
end $$;

-- Org-wide variant, org-admin gated, flattened across the org's projects.
create or replace function public.compute_org_material_stockout(p_org_id uuid)
returns table (
  project_id          uuid,
  material            text,
  unit                text,
  current_stock       numeric,
  monthly_consumption numeric,
  lead_days           integer,
  days_remaining      numeric,
  stockout_critical   boolean
) language plpgsql security definer set search_path = public as $$
declare
  v_proj record;
  v_m    record;
begin
  if not (public.is_superadmin() or public.has_org_tier(p_org_id, 'admin')) then
    raise exception 'insufficient privileges';
  end if;
  for v_proj in
    select prj.id from public.projects prj
    where prj.org_id = p_org_id
    order by prj.id
  loop
    for v_m in select * from public._material_stockout_rows(v_proj.id) loop
      project_id := v_proj.id;
      material := v_m.material;
      unit := v_m.unit;
      current_stock := v_m.current_stock;
      monthly_consumption := v_m.monthly_consumption;
      lead_days := v_m.lead_days;
      days_remaining := v_m.days_remaining;
      stockout_critical := v_m.stockout_critical;
      return next;
    end loop;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Grants + pg_cron wiring
-- ═══════════════════════════════════════════════════════════════════════════
-- On-demand RPCs (org-admin gated inside); cron wrappers for service_role;
-- helpers stay un-granted (internal only).
grant execute on function public.compute_cost_forecast(uuid) to authenticated;
grant execute on function public.compute_all_cost_forecasts() to service_role;
grant execute on function public.compute_labour_metrics(uuid) to authenticated;
grant execute on function public.compute_all_labour_metrics() to service_role;
grant execute on function public.compute_material_stockout(uuid) to authenticated;
grant execute on function public.compute_org_material_stockout(uuid) to authenticated;

comment on function public._cost_forecast_row(uuid) is
  'Internal definer helper — do not grant; callers are cron wrapper + org-admin RPC.';
comment on function public._labour_metrics_row(uuid) is
  'Internal definer helper — do not grant; callers are cron wrapper + org-admin RPC.';
comment on function public._material_stockout_rows(uuid) is
  'Internal definer helper — do not grant; callers compute_material_stockout / compute_org_material_stockout.';

-- Idempotent (re-)schedule (mirrors migration 225).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'compute-cost-forecast') then
    perform cron.unschedule('compute-cost-forecast');
  end if;
  if exists (select 1 from cron.job where jobname = 'compute-labour-metrics') then
    perform cron.unschedule('compute-labour-metrics');
  end if;
end $$;

-- Monthly forecast on the 1st at 02:30 UTC (08:00 IST).
select cron.schedule(
  'compute-cost-forecast',
  '30 2 1 * *',
  'select public.compute_all_cost_forecasts()'
);

-- Weekly labour-metrics roll for the just-completed ISO week, Sunday 23:30 UTC.
select cron.schedule(
  'compute-labour-metrics',
  '30 23 * * 0',
  'select public.compute_all_labour_metrics()'
);

do $$ begin
  raise notice '263: cost_forecast + labour_metrics themes ready (cron: monthly forecast / weekly labour)';
end $$;

COMMIT;