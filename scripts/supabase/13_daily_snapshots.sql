-- SiteTrack Pro — Daily EOD KPI snapshots (frozen, immutable).
-- Run AFTER 12_delegations.sql. Idempotent.
--
-- Mirrors src/lib/dailySnapshot.js + INIT_DAILY_SNAPSHOTS seed.
-- One row per (project, date). The freeze is application-driven (a cron or
-- end-of-day button); after freeze the row is read-only and feeds the Gantt
-- baseline, AI forecast training data, and the audit anchor chain.

create table if not exists daily_snapshots (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  snapshot_date   date not null,
  progress        smallint check (progress between 0 and 100),
  spend           bigint,
  labour_count    smallint,
  open_issues     smallint,
  weather         text,
  materials_in    jsonb default '[]'::jsonb,
  materials_out   jsonb default '[]'::jsonb,
  summary         text,
  payload         jsonb default '{}'::jsonb,           -- catch-all for future KPIs
  frozen_at       timestamptz not null default now(),
  frozen_by       uuid references profiles(id),
  unique (project_id, snapshot_date)
);

create index if not exists idx_snapshots_project_date
  on daily_snapshots(project_id, snapshot_date desc);

alter table daily_snapshots enable row level security;

drop policy if exists snapshots_read on daily_snapshots;
create policy snapshots_read on daily_snapshots for select
  using (project_id in (select user_project_ids()));

drop policy if exists snapshots_insert on daily_snapshots;
create policy snapshots_insert on daily_snapshots for insert
  with check (
    current_role_text() in (
      'pm','site_engineer','project_admin','project_head','orgadmin','superadmin'
    )
    and project_id in (select user_project_ids())
  );

-- Snapshots are immutable after insert. Direct UPDATE / DELETE forbidden;
-- corrections happen via a new dated row.
revoke update, delete on daily_snapshots from authenticated;

do $$ declare n int; begin
  select count(*) into n from daily_snapshots;
  raise notice '13_daily_snapshots: ready. % frozen snapshot(s).', n;
end $$;