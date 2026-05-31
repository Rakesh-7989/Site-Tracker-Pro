-- SiteTrack Pro — Field ops: equipment + diary + expenses.
-- Run AFTER 20_workforce.sql. Idempotent.

-- ============================================================================
-- 1. Equipment — heavy machinery / tools per project
-- ============================================================================
create table if not exists equipment (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  name              text not null,
  asset_no          text,
  type              text,                                   -- excavator/crane/mixer/scaffold/etc
  ownership         text default 'rental' check (ownership in ('owned','rental','hire')),
  vendor_id         uuid references vendors(id) on delete set null,
  rate_per_day      numeric(12,2),
  on_site_from      date,
  on_site_to        date,
  status            text default 'on_site'
    check (status in ('on_site','demobilised','under_maintenance','idle')),
  last_maintenance  date,
  next_maintenance  date,
  operator_name     text,
  meter_unit        text,                                   -- hours/km
  meter_reading     numeric(12,2),
  notes             text,
  created_at        timestamptz default now()
);
create index if not exists idx_equipment_project_status on equipment(project_id, status);
alter table equipment enable row level security;
create policy equipment_read on equipment for select
  using (project_id in (select user_project_ids()));
create policy equipment_write on equipment for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'pm','project_admin','project_head','orgadmin','superadmin','contractor','site_engineer'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'pm','project_admin','project_head','orgadmin','superadmin','contractor','site_engineer'
              ));

-- ============================================================================
-- 2. Diary — site diary, one per (project, date)
-- ============================================================================
create table if not exists diary (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  date          date not null default current_date,
  author_id     uuid references profiles(id),
  weather       text,
  temperature_c numeric(4,1),
  workers_count smallint,
  visitors      text,
  events        text,
  delays        text,
  safety_notes  text,
  next_day_plan text,
  attachments   jsonb default '[]'::jsonb,
  created_at    timestamptz default now(),
  unique (project_id, date)
);
create index if not exists idx_diary_project_date on diary(project_id, date desc);
alter table diary enable row level security;
create policy diary_read on diary for select
  using (project_id in (select user_project_ids()));
create policy diary_write on diary for all
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

-- ============================================================================
-- 3. Expenses — per-project cost recording (cash-flow side, distinct from PO/RA)
-- ============================================================================
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  category      text not null,                              -- material/labour/equipment/admin/permit/other
  description   text not null,
  amount        bigint not null check (amount > 0),
  gst           numeric(4,2) default 0,
  paid_to       text,
  paid_via      text check (paid_via in ('cash','bank','upi','cheque','card','other')),
  ref_no        text,
  expense_date  date default current_date,
  recorded_by   uuid references profiles(id),
  status        text default 'recorded'
    check (status in ('recorded','reimbursed','approved','rejected','disputed')),
  attachments   jsonb default '[]'::jsonb,
  created_at    timestamptz default now()
);
create index if not exists idx_expenses_project_date on expenses(project_id, expense_date desc);
create index if not exists idx_expenses_project_category on expenses(project_id, category);
alter table expenses enable row level security;
create policy expenses_read on expenses for select
  using (project_id in (select user_project_ids()));
create policy expenses_write on expenses for all
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

do $$ declare a int; b int; c int; begin
  select count(*) into a from equipment;
  select count(*) into b from diary;
  select count(*) into c from expenses;
  raise notice '21_field_ops: equipment=%, diary=%, expenses=%', a, b, c;
end $$;
