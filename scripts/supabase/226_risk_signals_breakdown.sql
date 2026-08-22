-- SiteTrack Pro — Risk signals breakdown persistence (v5 Pillar 1 follow-up).
-- Adds a per-signal jsonb breakdown to project_risk_signals (migration 225
-- stored only the folded score/level). The nightly scorer now also persists
-- [{code, severity, title, detail}, ...] mirroring src/app/riskQueries.ts so
-- the UI card and promoter digest can render server-side rows without
-- recomputing. Idempotent; safe to re-apply.

BEGIN;

alter table public.project_risk_signals
  add column if not exists signals jsonb not null default '[]'::jsonb;

create or replace function public.compute_project_risk_signals()
returns table (
  project_id        uuid,
  risk_score        integer,
  risk_level        text,
  delay_probability numeric,
  delay_days        integer,
  updated_at        timestamptz
) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today      date := (now() at time zone 'Asia/Kolkata')::date;
  v_proj       record;
  v_overdue    integer;
  v_max_late   integer;
  v_allocated  numeric;
  v_spent      numeric;
  v_burn       numeric;
  v_high_open  integer;
  v_weight     integer;
  v_score      integer;
  v_signals    jsonb := '[]'::jsonb;
begin
  for v_proj in
    select p.id
    from public.projects p
    where p.status = 'active'
    order by p.id
  loop
    -- Schedule slip (SLIP_DAYS = 3, escalation at 14 days late)
    select count(*), coalesce(max(v_today - ms.due_date), 0)
      into v_overdue, v_max_late
      from public.milestones ms
      where ms.project_id = v_proj.id
        and ms.status <> 'completed'
        and ms.due_date is not null
        and (v_today - ms.due_date) >= 3;

    -- Budget burn (spend = Σ recorded expenses; budget = projects.budget)
    select p.budget::numeric, coalesce(sum(e.amount), 0)::numeric
      into v_allocated, v_spent
      from public.projects p
      left join public.expenses e on e.project_id = p.id
      where p.id = v_proj.id
      group by p.budget;

    v_burn := case when coalesce(v_allocated, 0) > 0
                   then v_spent / v_allocated else 0 end;

    -- Open high-severity issues
    select count(*) into v_high_open
      from public.issues i
      where i.project_id = v_proj.id
        and i.severity = 'high'
        and i.status <> 'resolved';

    -- Fold signals — weights mirror riskQueries.ts (high=34 / medium=20)
    v_weight  := 0;
    v_signals := '[]'::jsonb;

    if v_overdue > 0 then
      v_weight := v_weight + case when v_max_late >= 14 then 34 else 20 end;
      v_signals := v_signals || jsonb_build_object(
        'code', 'schedule_slip',
        'severity', case when v_max_late >= 14 then 'high' else 'medium' end,
        'title', v_overdue || ' milestone' || case when v_overdue > 1 then 's' else '' end || ' past due',
        'detail', 'Latest is ' || v_max_late || ' days overdue.');
    end if;

    if coalesce(v_allocated, 0) > 0 and v_burn >= 1.0 then
      v_weight := v_weight + 34;
      v_signals := v_signals || jsonb_build_object(
        'code', 'budget_overrun',
        'severity', 'high',
        'title', 'Budget spent',
        'detail', 'Spend is ' || round(v_burn * 100) || '% of the plan.');
    elsif coalesce(v_allocated, 0) > 0 and v_burn >= 0.8 then
      v_weight := v_weight + 20;
      v_signals := v_signals || jsonb_build_object(
        'code', 'budget_burn',
        'severity', 'medium',
        'title', round(v_burn * 100) || '% budget consumed',
        'detail', 'Remaining budget is running low for the scope left.');
    end if;

    if v_high_open > 0 then
      v_weight := v_weight + case when v_high_open >= 3 then 34 else 20 end;
      v_signals := v_signals || jsonb_build_object(
        'code', 'high_severity_issues',
        'severity', case when v_high_open >= 3 then 'high' else 'medium' end,
        'title', v_high_open || ' open high-severity issue' || case when v_high_open > 1 then 's' else '' end,
        'detail', 'Blocking defects are unresolved.');
    end if;

    v_score := least(100, v_weight);

    -- Upsert this project's row (idempotent within the day)
    insert into public.project_risk_signals as r
      (project_id, risk_score, risk_level, delay_probability, delay_days,
       burn_accelerating, signals, updated_at)
    values (
      v_proj.id,
      v_score,
      case when v_score >= 70 then 'critical'
           when v_score >= 45 then 'high'
           when v_score >= 25 then 'medium'
           else 'low' end,
      least(0.9, v_score / 100.0),
      greatest(coalesce(v_max_late, 0), 0),
      coalesce(v_allocated, 0) > 0 and v_burn >= 0.8 and v_burn < 1.0,
      v_signals,
      now()
    )
    on conflict (project_id) do update
      set risk_score        = excluded.risk_score,
          risk_level        = excluded.risk_level,
          delay_probability = excluded.delay_probability,
          delay_days        = excluded.delay_days,
          burn_accelerating = excluded.burn_accelerating,
          signals           = excluded.signals,
          updated_at        = now();

    project_id        := v_proj.id;
    risk_score        := v_score;
    risk_level        := case when v_score >= 70 then 'critical'
                              when v_score >= 45 then 'high'
                              when v_score >= 25 then 'medium'
                              else 'low' end;
    delay_probability := least(0.9, v_score / 100.0);
    delay_days        := greatest(coalesce(v_max_late, 0), 0);
    updated_at        := now();
    return next;
  end loop;
end;
$$;

comment on function public.compute_project_risk_signals() is
  'Nightly risk scoring per active project (port of computeRiskSignals from src/app/riskQueries.ts); persists per-signal breakdown jsonb. Cron-owned; service_role may execute.';

do $$ begin
  raise notice '226_risk_signals_breakdown: signals jsonb column + scorer now persists per-signal detail';
end $$;

COMMIT;
