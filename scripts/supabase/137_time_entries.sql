-- SiteTrack Pro — v4 Phase C1: billable time entries.
-- Run AFTER 136_consultancy_feature_caps.sql. Idempotent.
--
-- Fixed-fee engagements bill against fee phases (138_fee_phases.sql); logged
-- billable hours are the variance measure (fee vs. effort) feeding the
-- utilization report. This is PROFESSIONAL time tracking — distinct from
-- worklogs (20_workforce.sql), which is a non-billable site diary.
--
-- Capability mapping (src/auth/planCaps.ts + permissions-matrix.ts):
--   time:log    → log your own entries          → RLS: insert self
--   time:manage → edit/delete any entry (admin) → RLS: edit/delete self OR org admin
--
-- RLS is defense-in-depth; the TS capability layer enforces UI gating.

BEGIN;

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  date        date not null default current_date,
  activity    text not null,
  hours       numeric(5,2) not null check (hours > 0 and hours <= 24),
  billable    boolean not null default true,
  rate        numeric(14,2),            -- ₹ / hour, snapshot at log time (nullable)
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_time_entries_project_date on public.time_entries(project_id, date desc);
create index if not exists idx_time_entries_profile_date on public.time_entries(profile_id, date desc);
create index if not exists idx_time_entries_billable on public.time_entries(project_id, billable) where billable;

alter table public.time_entries enable row level security;

drop policy if exists time_entries_read on public.time_entries;
create policy time_entries_read on public.time_entries for select
  using (project_id in (select user_project_ids()));

drop policy if exists time_entries_insert_self on public.time_entries;
create policy time_entries_insert_self on public.time_entries for insert
  with check (
    project_id in (select user_project_ids())
    and profile_id = auth.uid()
  );

drop policy if exists time_entries_edit_self on public.time_entries;
create policy time_entries_edit_self on public.time_entries for update
  using (profile_id = auth.uid() or is_orgadmin())
  with check (profile_id = auth.uid() or is_orgadmin());

drop policy if exists time_entries_delete_self on public.time_entries;
create policy time_entries_delete_self on public.time_entries for delete
  using (profile_id = auth.uid() or is_orgadmin());

grant select, insert, update, delete on public.time_entries to authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.time_entries;
  RAISE NOTICE '137_time_entries: ready, rows=%', n;
END $$;

COMMIT;
