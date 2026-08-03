-- SiteTrack Pro — v4 Phase C1: deliverables register + design review rounds.
-- Run AFTER 138_fee_phases.sql. Idempotent.
--
-- deliverables: every document/artifact a consultancy/design project owes its
-- client (drawings, specs, reports, models, schedules, certificates). Each
-- has a lifecycle (draft → in_review → approved / rejected → issued) and can
-- be scoped to a fee phase.
--
-- review_rounds: the back-and-forth on a deliverable. Each round = one
-- submission cycle; the consultant responds to client feedback in a comment,
-- then re-submits (new round) until approved. status open → closed.
--
-- Capability mapping:
--   deliverable:manage  → create/edit deliverables        → RLS: any project member
--   deliverable:approve → approve/reject/issue            → RLS: managers + org admin
--   review:comment      → comment on a review round       → RLS: any project member
--   review:manage       → open/close review rounds        → RLS: managers + org admin
--
-- Manager identity roles: pm, project_admin, design_head, consultant_head,
-- orgadmin, superadmin (mirrors permissions-matrix.ts phase:manage/deliverable:approve).

BEGIN;

create table if not exists public.deliverables (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  phase_id    uuid references public.fee_phases(id) on delete set null,
  title       text not null,
  doc_type    text not null check (doc_type in ('drawing','spec','report','model','schedule','certificate','other')),
  status      text not null default 'draft'
    check (status in ('draft','in_review','approved','rejected','issued')),
  due_date    date,
  owner_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_deliverables_project on public.deliverables(project_id, status, due_date);
create index if not exists idx_deliverables_phase on public.deliverables(phase_id) where phase_id is not null;

create table if not exists public.review_rounds (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  round_no       int not null check (round_no > 0),
  status         text not null default 'open' check (status in ('open','closed')),
  requested_by   uuid references public.profiles(id) on delete set null,
  comments       text,
  closed_by      uuid references public.profiles(id) on delete set null,
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (deliverable_id, round_no)
);

create index if not exists idx_review_rounds_deliverable on public.review_rounds(deliverable_id, round_no);

alter table public.deliverables enable row level security;
alter table public.review_rounds enable row level security;

-- ── deliverables ─────────────────────────────────────────────────────────────
drop policy if exists deliverables_read on public.deliverables;
create policy deliverables_read on public.deliverables for select
  using (project_id in (select user_project_ids()));

drop policy if exists deliverables_manage on public.deliverables;
create policy deliverables_manage on public.deliverables for insert
  with check (
    project_id in (select user_project_ids())
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

drop policy if exists deliverables_edit on public.deliverables;
create policy deliverables_edit on public.deliverables for update
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

-- Delete restricted to managers + org admin (deliverable:approve proxy).
drop policy if exists deliverables_delete on public.deliverables;
create policy deliverables_delete on public.deliverables for delete
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

-- ── review_rounds ────────────────────────────────────────────────────────────
drop policy if exists review_rounds_read on public.review_rounds;
create policy review_rounds_read on public.review_rounds for select
  using (deliverable_id in (
    select d.id from public.deliverables d
    where d.project_id in (select user_project_ids())
  ));

-- Any project member (incl. client) may comment / open a round.
drop policy if exists review_rounds_comment on public.review_rounds;
create policy review_rounds_comment on public.review_rounds for insert
  with check (deliverable_id in (
    select d.id from public.deliverables d
    where d.project_id in (select user_project_ids())
  ));

-- Closing a round is a manage action → managers + org admin.
drop policy if exists review_rounds_manage on public.review_rounds;
create policy review_rounds_manage on public.review_rounds for update
  using (
    is_orgadmin()
    or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
  )
  with check (
    is_orgadmin()
    or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
  );

grant select, insert, update, delete on public.deliverables to authenticated;
grant select, insert, update, delete on public.review_rounds to authenticated;

DO $$ DECLARE d int; r int; BEGIN
  SELECT count(*) INTO d FROM public.deliverables;
  SELECT count(*) INTO r FROM public.review_rounds;
  RAISE NOTICE '139_deliverables_reviews: deliverables=% review_rounds=%', d, r;
END $$;

COMMIT;
