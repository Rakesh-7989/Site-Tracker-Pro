-- SiteTrack Pro — v4 Phase G3: labour wages — shift roster + overtime.
-- Run AFTER 20_workforce.sql (needs attendance + labour_register). Idempotent.
--
-- Construction labour depth:
--   1. attendance.overtime — records extra (overtime) hours on an attendance
--      row so wage computation can include OT at a premium. Simple numeric
--      column, default 0, non-negative (client-side wage slip reads it).
--   2. shift_roster — a project-scoped register mapping a worker to a named
--      shift (day/night/general) with planned start/end times on a date.
--      Mirrors attendance RLS (read = member, insert = member, update/delete
--      = pm+ set) so kiosk/manual flows can both write it.
--
-- wages + EPF/ESI already live on labour_register (wage, epf, esi columns
-- from 01_schema.sql); G3 surfaces them in the Labour tab (they existed but
-- were never read by the UI). No schema change needed for those columns.

BEGIN;

-- ── 1. attendance.overtime ─────────────────────────────────────────────────
alter table public.attendance
  add column if not exists overtime numeric(5,2) not null default 0
  check (overtime >= 0);

-- ── 2. shift_roster ────────────────────────────────────────────────────────
create table if not exists public.shift_roster (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  labour_id   uuid references public.labour_register(id) on delete cascade,
  worker_name text,                                   -- snapshot even if FK cleared
  shift_date  date not null default current_date,
  shift_name  text not null default 'day'
    check (shift_name in ('day','night','general','special')),
  start_time  time,
  end_time    time,
  notes       text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_shift_roster_project_date on public.shift_roster(project_id, shift_date desc);
create index if not exists idx_shift_roster_labour on public.shift_roster(labour_id, shift_date desc) where labour_id is not null;

alter table public.shift_roster enable row level security;

-- Read: any project member.
drop policy if exists sr_read on public.shift_roster;
create policy sr_read on public.shift_roster for select
  using (project_id in (select public.user_project_ids()));

-- Insert: any project member (mirrors attendance_insert).
drop policy if exists sr_insert on public.shift_roster;
create policy sr_insert on public.shift_roster for insert
  with check (project_id in (select public.user_project_ids()));

-- Update / delete: pm+ set (mirrors attendance_update).
drop policy if exists sr_update on public.shift_roster;
create policy sr_update on public.shift_roster for update
  using (
    project_id in (select public.user_project_ids())
    and current_role_text() in ('pm','project_admin','project_head','orgadmin','superadmin')
  )
  with check (
    project_id in (select public.user_project_ids())
    and current_role_text() in ('pm','project_admin','project_head','orgadmin','superadmin')
  );

drop policy if exists sr_delete on public.shift_roster;
create policy sr_delete on public.shift_roster for delete
  using (
    project_id in (select public.user_project_ids())
    and current_role_text() in ('pm','project_admin','project_head','orgadmin','superadmin')
  );

grant select, insert, update, delete on public.shift_roster to authenticated;
revoke all on public.shift_roster from anon;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.shift_roster;
  RAISE NOTICE '169_shift_roster: shift_roster_rows=%', n;
END $$;

COMMIT;