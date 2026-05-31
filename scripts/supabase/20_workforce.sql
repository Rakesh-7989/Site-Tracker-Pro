-- SiteTrack Pro — Workforce: teams + attendance + worklogs.
-- Run AFTER 19_comms.sql. Idempotent.

-- ============================================================================
-- 1. Teams — per-project crew rosters
-- ============================================================================
create table if not exists teams (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  name          text not null,
  trade         text,                                       -- civil/mep/finishing/etc
  lead_id       uuid references profiles(id),
  members       jsonb default '[]'::jsonb,                  -- [{profile_id, role}]
  active        boolean default true,
  created_at    timestamptz default now()
);
create index if not exists idx_teams_project on teams(project_id) where active = true;
alter table teams enable row level security;
create policy teams_read on teams for select
  using (project_id in (select user_project_ids()));
create policy teams_write on teams for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'pm','project_admin','project_head','orgadmin','superadmin','contractor'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'pm','project_admin','project_head','orgadmin','superadmin','contractor'
              ));

-- ============================================================================
-- 2. Attendance — per-project daily roll for labour AND staff
-- ============================================================================
create table if not exists attendance (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  attendee_kind text not null check (attendee_kind in ('labour','staff','visitor')),
  labour_id     uuid references labour_register(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete cascade,
  attendee_name text not null,                              -- snapshot even if FK cleared
  date          date not null default current_date,
  status        text not null default 'present'
    check (status in ('present','absent','half_day','leave','on_site_late','off_site')),
  in_time       time,
  out_time      time,
  hours         numeric(5,2),
  source        text,                                       -- kiosk / manual / qr / bio
  geo           jsonb,                                      -- {lat,lng,captured_at}
  recorded_by   uuid references profiles(id),
  created_at    timestamptz default now(),
  -- One row per (project, attendee, date)
  unique (project_id, coalesce(labour_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid), date),
  check (
    (attendee_kind = 'labour'   and labour_id  is not null)
    or (attendee_kind = 'staff' and profile_id is not null)
    or attendee_kind = 'visitor'
  )
);
create index if not exists idx_attendance_project_date on attendance(project_id, date desc);
create index if not exists idx_attendance_labour on attendance(labour_id, date desc) where labour_id is not null;
alter table attendance enable row level security;
create policy attendance_read on attendance for select
  using (project_id in (select user_project_ids()));
create policy attendance_insert on attendance for insert
  with check (project_id in (select user_project_ids()));
-- Edits restricted to PM+ (correcting kiosk errors).
create policy attendance_update on attendance for update
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'pm','project_admin','project_head','orgadmin','superadmin'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'pm','project_admin','project_head','orgadmin','superadmin'
              ));

-- ============================================================================
-- 3. Worklogs — what each staff member did each day
-- ============================================================================
create table if not exists worklogs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  date          date not null default current_date,
  activity      text not null,
  task_id       uuid references tasks(id) on delete set null,
  hours         numeric(5,2) not null check (hours > 0 and hours <= 24),
  notes         text,
  created_at    timestamptz default now(),
  unique (project_id, profile_id, date, activity)
);
create index if not exists idx_worklogs_project_date on worklogs(project_id, date desc);
create index if not exists idx_worklogs_user_date on worklogs(profile_id, date desc);
alter table worklogs enable row level security;
create policy worklogs_read on worklogs for select
  using (project_id in (select user_project_ids()));
create policy worklogs_insert_self on worklogs for insert
  with check (project_id in (select user_project_ids()) and profile_id = auth.uid());
create policy worklogs_edit_self on worklogs for update
  using (profile_id = auth.uid() or is_orgadmin())
  with check (profile_id = auth.uid() or is_orgadmin());

do $$ declare a int; b int; c int; begin
  select count(*) into a from teams;
  select count(*) into b from attendance;
  select count(*) into c from worklogs;
  raise notice '20_workforce: teams=%, attendance=%, worklogs=%', a, b, c;
end $$;
