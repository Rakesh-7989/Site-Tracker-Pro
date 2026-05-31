-- SiteTrack Pro — AI cost / schedule forecast cache.
-- Run AFTER 14_compliance.sql. Idempotent.
--
-- Mirrors src/lib/aiForecast.js + INIT_FORECAST seed.
-- One row per forecast run; we keep history rather than upserting so we can
-- chart accuracy over time. Latest row per project drives the UI.

create table if not exists forecast (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  generated_at    timestamptz not null default now(),
  horizon_days    int,
  predicted_end   date,
  predicted_cost  bigint,
  overrun_amount  bigint,
  -- Bug-fix Session 27.1: numeric(4,2) caps at 99.99 but check allowed 100 —
  -- a 100.00 insert would overflow. Widened to numeric(5,2) for headroom.
  risk_score      numeric(5,2) check (risk_score between 0 and 100),
  confidence      numeric(4,2) check (confidence between 0 and 1),
  rationale       text,                                    -- LLM-generated, lang-aware
  lang            text default 'en' check (lang in ('en','te','hi')),
  model           text,                                    -- 'gpt-4o-mini', 'claude-3-5-haiku', etc.
  inputs          jsonb default '{}'::jsonb,               -- snapshot of inputs that produced this
  generated_by    uuid references profiles(id)
);

create index if not exists idx_forecast_project_recent
  on forecast(project_id, generated_at desc);

alter table forecast enable row level security;

create policy forecast_read on forecast for select
  using (project_id in (select user_project_ids()));

create policy forecast_insert on forecast for insert
  with check (
    current_role_text() in (
      'pm','project_admin','project_head','orgadmin','superadmin','architect'
    )
    and project_id in (select user_project_ids())
  );

revoke update, delete on forecast from authenticated;

do $$ declare n int; begin
  select count(*) into n from forecast;
  raise notice '15_forecast: ready. % forecast run(s).', n;
end $$;
