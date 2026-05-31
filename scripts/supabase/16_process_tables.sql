-- SiteTrack Pro — Process tables: RFI / Change Orders / Inspections / Safety.
-- Run AFTER 15_forecast.sql. Idempotent.
--
-- Mirrors INIT_RFI / INIT_CO / INIT_INSPECTIONS / INIT_SAFETY seeds.

-- ============================================================================
-- 1. RFI — Request For Information
-- ============================================================================
create table if not exists rfi (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  no           text not null,
  subject      text not null,
  question     text not null,
  category     text,                                       -- structural / mep / arch / other
  asked_by     uuid references profiles(id),
  asked_at     date default current_date,
  due_date     date,
  status       text default 'open'
    check (status in ('open','answered','closed','overdue')),
  response     text,
  responded_by uuid references profiles(id),
  responded_at timestamptz,
  created_at   timestamptz default now()
);
create index if not exists idx_rfi_project_status on rfi(project_id, status);
alter table rfi enable row level security;
create policy rfi_read on rfi for select
  using (project_id in (select user_project_ids()));
create policy rfi_write on rfi for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'architect','pm','contractor','sub_contractor','project_admin',
           'project_head','site_engineer','mep_consultant','orgadmin','superadmin'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'architect','pm','contractor','sub_contractor','project_admin',
                'project_head','site_engineer','mep_consultant','orgadmin','superadmin'
              ));

-- ============================================================================
-- 2. CO — Change Orders
-- ============================================================================
create table if not exists change_orders (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  no              text not null,
  description     text not null,
  scope_change    text,
  cost_impact     bigint,
  schedule_impact int,                                      -- days +/-
  reason          text,
  raised_by       uuid references profiles(id),
  raised_at       date default current_date,
  status          text default 'submitted'
    check (status in ('submitted','approved','rejected','cancelled')),
  approved_by     uuid references profiles(id),
  approved_at     timestamptz,
  created_at      timestamptz default now()
);
create index if not exists idx_co_project_status on change_orders(project_id, status);
alter table change_orders enable row level security;
create policy co_read on change_orders for select
  using (project_id in (select user_project_ids()));
create policy co_write on change_orders for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'pm','project_admin','project_head','orgadmin','superadmin','architect'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'pm','project_admin','project_head','orgadmin','superadmin','architect'
              ));

-- ============================================================================
-- 3. Inspections
-- ============================================================================
create table if not exists inspections (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  type            text not null,                            -- structural / safety / quality / handover
  scheduled_date  date,
  conducted_date  date,
  inspector_name  text,
  inspector_id    uuid references profiles(id),
  scope           text,
  result          text check (result in ('pending','pass','fail','conditional')),
  observations    text,
  follow_ups      jsonb default '[]'::jsonb,
  status          text default 'scheduled'
    check (status in ('scheduled','in_progress','completed','cancelled')),
  created_at      timestamptz default now()
);
create index if not exists idx_inspections_project_date on inspections(project_id, scheduled_date desc);
alter table inspections enable row level security;
create policy inspections_read on inspections for select
  using (project_id in (select user_project_ids()));
create policy inspections_write on inspections for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'pm','project_admin','project_head','orgadmin','superadmin',
           'site_inspector','consultant','principal_consultant'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'pm','project_admin','project_head','orgadmin','superadmin',
                'site_inspector','consultant','principal_consultant'
              ));

-- ============================================================================
-- 4. Safety incidents
-- ============================================================================
create table if not exists safety (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  incident_date   date not null default current_date,
  severity        text not null check (severity in ('near_miss','first_aid','minor','major','fatal')),
  category        text,                                     -- fall / electrical / fire / ppe / other
  description     text not null,
  location        text,
  reported_by     uuid references profiles(id),
  action_taken    text,
  follow_ups      jsonb default '[]'::jsonb,
  status          text default 'open'
    check (status in ('open','resolved','escalated')),
  created_at      timestamptz default now()
);
create index if not exists idx_safety_project_date on safety(project_id, incident_date desc);
create index if not exists idx_safety_severity on safety(severity);
alter table safety enable row level security;
create policy safety_read on safety for select
  using (project_id in (select user_project_ids()));
create policy safety_write on safety for all
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

do $$ declare a int; b int; c int; d int; begin
  select count(*) into a from rfi;
  select count(*) into b from change_orders;
  select count(*) into c from inspections;
  select count(*) into d from safety;
  raise notice '16_process_tables: rfi=%, co=%, inspections=%, safety=%', a, b, c, d;
end $$;
