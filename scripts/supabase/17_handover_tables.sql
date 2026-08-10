-- SiteTrack Pro — Handover tables: punch / submittals / permits.
-- Run AFTER 16_process_tables.sql. Idempotent.

-- ============================================================================
-- 1. Punch list — defect tracking near handover
-- ============================================================================
create table if not exists punch (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  unit_id       uuid references units(id) on delete set null,
  location      text not null,
  trade         text,                                       -- civil/electrical/plumbing/finishing/etc
  defect        text not null,
  severity      text default 'medium' check (severity in ('low','medium','high','critical')),
  reported_by   uuid references profiles(id),
  reported_date date default current_date,
  assigned_to   text,
  due_date      date,
  status        text default 'open'
    check (status in ('open','in_progress','resolved','verified','wont_fix')),
  resolved_by   uuid references profiles(id),
  resolved_date date,
  created_at    timestamptz default now()
);
create index if not exists idx_punch_project_status on punch(project_id, status);
create index if not exists idx_punch_unit on punch(unit_id) where unit_id is not null;
alter table punch enable row level security;
drop policy if exists punch_read on punch;
create policy punch_read on punch for select
  using (project_id in (select user_project_ids()));
drop policy if exists punch_write on punch;
create policy punch_write on punch for all
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

-- ============================================================================
-- 2. Submittals — drawings / specs awaiting client/consultant approval
-- ============================================================================
create table if not exists submittals (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  no             text not null,
  type           text not null,                              -- shop_drawing / material_sample / method_statement
  title          text not null,
  description    text,
  drawing_id     uuid references drawings(id) on delete set null,
  submitted_by   uuid references profiles(id),
  submitted_at   timestamptz default now(),
  reviewer_role  text,
  status         text default 'pending'
    check (status in ('pending','approved','approved_w_comments','rejected','resubmit')),
  reviewed_by    uuid references profiles(id),
  reviewed_at    timestamptz,
  comments       text,
  created_at     timestamptz default now()
);
create index if not exists idx_submittals_project_status on submittals(project_id, status);
alter table submittals enable row level security;
drop policy if exists submittals_read on submittals;
create policy submittals_read on submittals for select
  using (project_id in (select user_project_ids()));
drop policy if exists submittals_write on submittals;
create policy submittals_write on submittals for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'architect','pm','contractor','sub_contractor','project_admin',
           'project_head','consultant','principal_consultant','orgadmin','superadmin'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'architect','pm','contractor','sub_contractor','project_admin',
                'project_head','consultant','principal_consultant','orgadmin','superadmin'
              ));

-- ============================================================================
-- 3. Permits — government & statutory clearances
-- ============================================================================
create table if not exists permits (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  kind               text not null,                          -- environment / commencement / occupancy / fire / electrical
  issuing_authority  text,
  ref_no             text,
  applied_at         date,
  issued_at          date,
  valid_until        date,
  status             text default 'applied'
    check (status in ('applied','issued','rejected','expired','renewal_due')),
  cost               bigint,
  notes              text,
  documents          jsonb default '[]'::jsonb,              -- attachment refs
  applied_by         uuid references profiles(id),
  created_at         timestamptz default now()
);
create index if not exists idx_permits_project_kind on permits(project_id, kind);
create index if not exists idx_permits_valid_until on permits(valid_until) where valid_until is not null;
alter table permits enable row level security;
drop policy if exists permits_read on permits;
create policy permits_read on permits for select
  using (project_id in (select user_project_ids()));
drop policy if exists permits_write on permits;
create policy permits_write on permits for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'pm','project_admin','project_head','orgadmin','superadmin','architect'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'pm','project_admin','project_head','orgadmin','superadmin','architect'
              ));

do $$ declare a int; b int; c int; begin
  select count(*) into a from punch;
  select count(*) into b from submittals;
  select count(*) into c from permits;
  raise notice '17_handover_tables: punch=%, submittals=%, permits=%', a, b, c;
end $$;