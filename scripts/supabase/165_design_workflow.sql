-- SiteTrack Pro — v4 Phase E Opt2: persisted per-project design-workflow stage.
-- Run AFTER 164_consultancy_audit_caps.sql. Idempotent.
--
-- The pure model (designWorkflow.ts, Opt1) derives a stage from drawings; this
-- layer persists the *current* lifecycle stage per project so the stepper (E2)
-- survives reloads and records who advanced / approved it. A project starts at
-- 'requirements' with stage_order 0; Advance bumps stage_order via the CP (the
-- stage label is derived from stage_order so the ordering is always canonical).
--
-- Gating mirrors the other v4 per-project registers: member read; write
-- (advance/review/approve) = manager set OR is_orgadmin OR project-tier manager
-- (has_project_role). Same manager pattern as migration 163.

BEGIN;

create table if not exists public.design_workflow (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  stage_order   int  not null default 0 check (stage_order between 0 and 6),
  -- review/approval annotations (nullable until performed)
  review_note   text,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  constraint design_workflow_one_per_project unique (project_id)
);

create index if not exists idx_design_workflow_project on public.design_workflow(project_id);

-- fractional ordering: pg_cron-style forward-compat bump; keep canonical ladder
-- here so prod and type-match. (Stage labels live in the app; order is source.)

create or replace function public.design_stage_order_ne()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_design_workflow_touch on public.design_workflow;
create trigger trg_design_workflow_touch
  before update on public.design_workflow
  for each row execute function public.design_stage_order_ne();

-- ── RLS: read = any project member; write = managers/orgadmin/project-tier ──
alter table public.design_workflow enable row level security;

drop policy if exists design_workflow_read on public.design_workflow;
create policy design_workflow_read on public.design_workflow for select
  using (project_id in (select public.user_project_ids())
         or is_superadmin());

drop policy if exists design_workflow_write on public.design_workflow;
create policy design_workflow_write on public.design_workflow for insert
  with check (
    project_id in (select public.user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or public.has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  );

drop policy if exists design_workflow_update on public.design_workflow;
create policy design_workflow_update on public.design_workflow for update
  using (project_id in (select public.user_project_ids())
         and (
           is_orgadmin()
           or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
           or public.has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
         ))
  with check (project_id in (select public.user_project_ids()));

drop policy if exists design_workflow_delete on public.design_workflow;
create policy design_workflow_delete on public.design_workflow for delete
  using (project_id in (select public.user_project_ids())
         and (
           is_orgadmin()
           or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
         ));

grant select, insert, update, delete on public.design_workflow to authenticated;
revoke all on public.design_workflow from anon;

DO $$ BEGIN
  RAISE NOTICE '165_design_workflow.sql: design_workflow stage table + manager/orgadmin write policies live';
END $$;

COMMIT;