-- SiteTrack Pro — Nightly project risk signals (v5 Pillar 1.1).
-- Server-side port of the deterministic computeRiskSignals() model from
-- src/app/riskQueries.ts (v4 Phase D). For every ACTIVE project it folds:
--   schedule slip   — pending/in_progress milestones ≥3 days past due
--                     (max slip ≥14 days escalates the signal to "high")
--   budget burn     — spent (Σ expenses.amount) vs projects.budget
--                     (≥100% → high "budget_overrun", ≥80% → medium "budget_burn")
--   open issues     — unresolved high-severity count (≥3 → high, >0 → medium)
-- into a weighted 0–100 score (high=34 / medium=20 / low=10) with level bands
-- critical≥70 / high≥45 / medium≥25, delay probability min(0.9, score/100)
-- and max slip days.
-- The TS model's RFI-lag signal is intentionally omitted server-side: no rfis
-- table exists yet (client card keeps computing it from its own feed).
-- Results upsert into project_risk_signals daily at 02:05 UTC (07:35 IST)
-- via pg_cron; re-runs within a day simply overwrite with fresh data.

BEGIN;

-- ── 1. Storage table ─────────────────────────────────────────────────────────
create table if not exists public.project_risk_signals (
  project_id        uuid primary key references public.projects(id)
                      on update cascade on delete cascade,
  risk_score        integer not null default 0 check (risk_score between 0 and 100),
  risk_level        text not null default 'low'
                      check (risk_level in ('low','medium','high','critical')),
  delay_probability numeric not null default 0
                      check (delay_probability >= 0 and delay_probability <= 0.9),
  delay_days        integer not null default 0 check (delay_days >= 0),
  burn_accelerating boolean not null default false,
  updated_at        timestamptz not null default now()
);

-- ── 2. RLS — member/org/superadmin read via can_read_project; cron-only writes
alter table public.project_risk_signals enable row level security;

drop policy if exists project_risk_signals_read on public.project_risk_signals;
create policy project_risk_signals_read on public.project_risk_signals
  for select
  using (public.can_read_project(project_id));

grant select on public.project_risk_signals to authenticated;
revoke all on public.project_risk_signals from anon;
-- No insert/update/delete grants to authenticated: writes stay cron-only
-- (function owner = postgres), mirroring the quota-snapshot posture.

-- ── 3. Scoring function (SECURITY DEFINER, runs as the owner under cron) ────
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
    v_weight := 0;
    if v_overdue > 0 then
      v_weight := v_weight + case when v_max_late >= 14 then 34 else 20 end;
    end if;
    if coalesce(v_allocated, 0) > 0 and v_burn >= 1.0 then
      v_weight := v_weight + 34;
    elsif coalesce(v_allocated, 0) > 0 and v_burn >= 0.8 then
      v_weight := v_weight + 20;
    end if;
    if v_high_open > 0 then
      v_weight := v_weight + case when v_high_open >= 3 then 34 else 20 end;
    end if;

    v_score := least(100, v_weight);

    -- Upsert this project's row (idempotent within the day)
    insert into public.project_risk_signals as r
      (project_id, risk_score, risk_level, delay_probability, delay_days,
       burn_accelerating, updated_at)
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
      now()
    )
    on conflict (project_id) do update
      set risk_score        = excluded.risk_score,
          risk_level        = excluded.risk_level,
          delay_probability = excluded.delay_probability,
          delay_days        = excluded.delay_days,
          burn_accelerating = excluded.burn_accelerating,
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
  'Nightly risk scoring per active project (port of computeRiskSignals from src/app/riskQueries.ts). Cron-owned; service_role may execute.';

grant execute on function public.compute_project_risk_signals() to service_role;

-- ── 4. Daily pg_cron schedule — 02:05 UTC (07:35 IST), idempotent by name ───
do $$
begin
  if exists (select 1 from cron.job where jobname = 'compute-risk-signals') then
    perform cron.unschedule('compute-risk-signals');
  end if;
end $$;
select cron.schedule(
  'compute-risk-signals',
  '5 2 * * *',
  'select public.compute_project_risk_signals()'
);

do $$ begin
  raise notice '225_risk_signals_cron: project_risk_signals table + compute_project_risk_signals() + daily cron job ready';
end $$;

COMMIT;
