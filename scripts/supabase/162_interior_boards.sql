-- SiteTrack Pro — v4 Phase B: Interior module surface (mood boards, rooms,
-- installation tracking). Run AFTER 161_crm_leads.sql. Idempotent.
--
-- mood_boards: client-facing interior inspiration boards — a themed collection
--   (title + optional image/media URL) the design team curates per project.
-- interior_rooms: the project's rooms being fit-out (living, kitchen, bedroom…)
--   with an area + finish-status lifecycle (planned → in_progress → installed /
--   cancelled).
-- room_installations: line items inside a room (wardrobe, kitchen platform…)
--   each with its own planned/done dates + status.
--
-- Capability mapping (reuses the ffe gate — no new capability):
--   ffe:manage → create/edit/delete boards + rooms + installations
--     → RLS: project member minus external (insert), member (update),
--        managers + org admin (delete) — mirrors 151_ffe_schedules.
-- Plan gate: PlanFeature "ffe" (Pro+) via the tab-level PlanGate.
-- Module: `design` (tab-level moduleId).
--
-- Manager identity roles: pm, project_admin, design_head, consultant_head,
-- orgadmin, superadmin (mirrors permissions-matrix.ts ffe:manage).

BEGIN;

create table if not exists public.mood_boards (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null,
  theme      text,
  media_url  text,
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mood_boards_project on public.mood_boards(project_id);

alter table public.mood_boards enable row level security;

drop policy if exists mood_boards_read on public.mood_boards;
create policy mood_boards_read on public.mood_boards for select
  using (project_id in (select user_project_ids()));

drop policy if exists mood_boards_insert on public.mood_boards;
create policy mood_boards_insert on public.mood_boards for insert
  with check (
    project_id in (select user_project_ids())
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

drop policy if exists mood_boards_update on public.mood_boards;
create policy mood_boards_update on public.mood_boards for update
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

drop policy if exists mood_boards_delete on public.mood_boards;
create policy mood_boards_delete on public.mood_boards for delete
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.mood_boards to authenticated;

create table if not exists public.interior_rooms (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null,
  area          numeric(10,2),
  finish_status text not null default 'planned'
    check (finish_status in ('planned','in_progress','installed','cancelled')),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_interior_rooms_project on public.interior_rooms(project_id, finish_status);

alter table public.interior_rooms enable row level security;

drop policy if exists interior_rooms_read on public.interior_rooms;
create policy interior_rooms_read on public.interior_rooms for select
  using (project_id in (select user_project_ids()));

drop policy if exists interior_rooms_insert on public.interior_rooms;
create policy interior_rooms_insert on public.interior_rooms for insert
  with check (
    project_id in (select user_project_ids())
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

drop policy if exists interior_rooms_update on public.interior_rooms;
create policy interior_rooms_update on public.interior_rooms for update
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

drop policy if exists interior_rooms_delete on public.interior_rooms;
create policy interior_rooms_delete on public.interior_rooms for delete
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.interior_rooms to authenticated;

create table if not exists public.room_installations (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.interior_rooms(id) on delete cascade,
  item         text not null,
  status       text not null default 'planned'
    check (status in ('planned','ordered','installed','cancelled')),
  planned_date date,
  done_date    date,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_room_installations_room on public.room_installations(room_id, status);

alter table public.room_installations enable row level security;

-- RLS is room-derived: gate via the parent room's project membership.
drop policy if exists room_installations_read on public.room_installations;
create policy room_installations_read on public.room_installations for select
  using (room_id in (select id from public.interior_rooms where project_id in (select user_project_ids())));

drop policy if exists room_installations_insert on public.room_installations;
create policy room_installations_insert on public.room_installations for insert
  with check (
    room_id in (select id from public.interior_rooms where project_id in (select user_project_ids()))
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

drop policy if exists room_installations_update on public.room_installations;
create policy room_installations_update on public.room_installations for update
  using (room_id in (select id from public.interior_rooms where project_id in (select user_project_ids())))
  with check (room_id in (select id from public.interior_rooms where project_id in (select user_project_ids())));

drop policy if exists room_installations_delete on public.room_installations;
create policy room_installations_delete on public.room_installations for delete
  using (
    room_id in (select id from public.interior_rooms where project_id in (select user_project_ids()))
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.room_installations to authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.mood_boards;
  RAISE NOTICE '162_interior_boards: mood_boards=%', n;
  SELECT count(*) INTO n FROM public.interior_rooms;
  RAISE NOTICE '162_interior_boards: interior_rooms=%', n;
  SELECT count(*) INTO n FROM public.room_installations;
  RAISE NOTICE '162_interior_boards: room_installations=%', n;
END $$;

COMMIT;
