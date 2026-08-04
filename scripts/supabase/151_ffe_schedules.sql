-- SiteTrack Pro — v4 Phase D3: FF&E schedule register (architecture segment).
-- Run AFTER 150_drawings_preview_url.sql. Idempotent.
--
-- ffe_entries: the furniture, fixtures & equipment schedule — a line-item
-- register a design/interior project owes its client. Each entry is spec'd
-- furniture/fixture/equipment for a named space/room with vendor + cost fields
-- and a lifecycle (specified → selected → ordered → installed / cancelled).
--
-- Capability mapping:
--   ffe:manage  → create/edit/delete entries        → RLS: project member
--     (manager)  → status transitions + cost        → RLS: managers + org admin
--
-- Budget rollup: entries carry a budgeted unit cost and qty so the frontend can
-- roll up committed (unit_cost × qty, installed/ordered/selected-only) vs
-- budgeted totals per project.
--
-- Manager identity roles: pm, project_admin, design_head, consultant_head,
-- orgadmin, superadmin (mirrors permissions-matrix.ts ffe:manage).

BEGIN;

create table if not exists public.ffe_entries (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  code         text not null,
  category     text not null default 'furniture'
    check (category in ('furniture','fixture','equipment')),
  name         text not null,
  space_or_room text,
  manufacturer text,
  model        text,
  finish       text,
  dimensions   text,
  qty          int not null default 1 check (qty > 0),
  unit_cost    bigint not null default 0 check (unit_cost >= 0),
  status       text not null default 'specified'
    check (status in ('specified','selected','ordered','installed','cancelled')),
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_ffe_entries_project on public.ffe_entries(project_id, status);
create index if not exists idx_ffe_entries_project_code on public.ffe_entries(project_id, code);

alter table public.ffe_entries enable row level security;

drop policy if exists ffe_entries_read on public.ffe_entries;
create policy ffe_entries_read on public.ffe_entries for select
  using (project_id in (select user_project_ids()));

-- Member write (ffe:manage) mirrors deliverables_manage/deliverables_delete:
-- inserts/updates = any non-external project member; delete = managers + orgadmin.
drop policy if exists ffe_entries_insert on public.ffe_entries;
create policy ffe_entries_insert on public.ffe_entries for insert
  with check (
    project_id in (select user_project_ids())
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

drop policy if exists ffe_entries_update on public.ffe_entries;
create policy ffe_entries_update on public.ffe_entries for update
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

drop policy if exists ffe_entries_delete on public.ffe_entries;
create policy ffe_entries_delete on public.ffe_entries for delete
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.ffe_entries to authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.ffe_entries;
  RAISE NOTICE '151_ffe_schedules: ffe_entries=%', n;
END $$;

COMMIT;