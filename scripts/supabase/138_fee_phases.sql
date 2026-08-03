-- SiteTrack Pro — v4 Phase C1: fixed-fee engagement phases.
-- Run AFTER 137_time_entries.sql. Idempotent.
--
-- A consultancy/design project's fee is split into phases (concept, SD, DD,
-- CD, site support, …). fee_amount is the agreed fee for the phase in whole
-- ₹ (bigint, matching invoices.amount). invoices gain an optional phase_id so
-- a raised invoice can be tagged to a phase.
--
-- Capability mapping:
--   phase:manage → create/edit/delete phases + amounts
--   read         → any project member
--
-- RLS: write gated to org admins + the identity roles that hold phase:manage
-- (pm / project_admin / design_head / consultant_head / orgadmin / superadmin).

BEGIN;

create table if not exists public.fee_phases (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  title           text not null,
  scope           text,
  fee_amount      bigint not null default 0 check (fee_amount >= 0),   -- whole ₹
  status          text not null default 'draft'
    check (status in ('draft','approved','in_progress','completed','cancelled')),
  due_date        date,
  completed_date  date,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_fee_phases_project on public.fee_phases(project_id, sort_order, id);

alter table public.invoices
  add column if not exists phase_id uuid references public.fee_phases(id) on delete set null;

alter table public.fee_phases enable row level security;

drop policy if exists fee_phases_read on public.fee_phases;
create policy fee_phases_read on public.fee_phases for select
  using (project_id in (select user_project_ids()));

drop policy if exists fee_phases_write on public.fee_phases;
create policy fee_phases_write on public.fee_phases for all
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  )
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.fee_phases to authenticated;
grant select, update (phase_id) on public.invoices to authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.fee_phases;
  RAISE NOTICE '138_fee_phases: ready, rows=% (invoices.phase_id added)', n;
END $$;

COMMIT;
