-- SiteTrack Pro — v4 Phase C: consultancy inspection/audit + reports.
-- Run AFTER 162_interior_boards.sql. Idempotent.
--
-- Adds inspection checklists, per-item results, and consultancy reports
-- (site visit / recommendation) for consultant/design projects. This is the
-- inspection/audit depth slice of the V4 consultancy segment — managers run
-- a checklist-driven site visit or design audit, record item results, and
-- capture the findings as a published consultancy report.
--
-- Data model notes:
--   • inspection_checklists → inspection_results (1:N). A checklist is a
--     project-scoped list of checks (scope/site visit/design review); each
--     result is one checklist line item with a pass/fail/na verdict + note.
--   • consultancy_reports (1:N per project) — the auditable artefacts: a
--     consolidated site_visit or recommendation report, with a status
--     draft/published for a simple approval lifecycle and created_by +
--     updated_at as the audit trail.
--   • Manager-write posture (mirrors statutory_approvals / 152): only
--     manager roles + org admin may mutate; any project member can read.
--
-- Capability mapping:
--   audit:manage → create/edit checklists, results, reports → RLS managers
--   (read-only for contributors / client)
--
-- Manager identity roles: pm, project_admin, design_head, consultant_head,
-- orgadmin, superadmin (mirrors permissions-matrix.ts audit:manage).

BEGIN;

-- ── 1. inspection_checklists ────────────────────────────────────────────────
create table if not exists public.inspection_checklists (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null default 'site_visit'
    check (kind in ('site_visit','design_review','quality_audit','other')),
  title       text not null,
  status      text not null default 'draft'
    check (status in ('draft','in_progress','passed','failed','cancelled')),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_cl_project on public.inspection_checklists(project_id, created_at);

-- ── 2. inspection_results ───────────────────────────────────────────────────
create table if not exists public.inspection_results (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references public.inspection_checklists(id) on delete cascade,
  item          text not null,
  result        text not null default 'na'
    check (result in ('pass','fail','na')),
  note          text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_result_checklist on public.inspection_results(checklist_id, sort_order);

-- ── 3. consultancy_reports ──────────────────────────────────────────────────
create table if not exists public.consultancy_reports (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  kind          text not null default 'site_visit'
    check (kind in ('site_visit','recommendation','milestone_review')),
  title         text not null,
  summary       text,
  content       text,
  status        text not null default 'draft'
    check (status in ('draft','published','archived')),
  period_from   date,
  period_to     date,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_report_project on public.consultancy_reports(project_id, created_at);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.inspection_checklists enable row level security;
alter table public.inspection_results enable row level security;
alter table public.consultancy_reports enable row level security;

-- Read: any project member (incl. client) can view checklists + reports.
drop policy if exists cl_read on public.inspection_checklists;
create policy cl_read on public.inspection_checklists for select
  using (project_id in (select public.user_project_ids()));

-- Insert / update: managers + org admin (audit:manage).
drop policy if exists cl_insert on public.inspection_checklists;
create policy cl_insert on public.inspection_checklists for insert
  with check (
    project_id in (select public.user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

drop policy if exists cl_update on public.inspection_checklists;
create policy cl_update on public.inspection_checklists for update
  using (
    project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  )
  with check (
    project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  );

drop policy if exists cl_delete on public.inspection_checklists;
create policy cl_delete on public.inspection_checklists for delete
  using (
    project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  );

-- inspection_results: gate via their checklist's project (read + manage).
drop policy if exists res_read on public.inspection_results;
create policy res_read on public.inspection_results for select
  using (exists (
    select 1 from public.inspection_checklists c
    where c.id = checklist_id and c.project_id in (select public.user_project_ids())
  ));

drop policy if exists res_write on public.inspection_results;
create policy res_write on public.inspection_results for all
  using (exists (
    select 1 from public.inspection_checklists c
    where c.id = checklist_id and c.project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  ))
  with check (exists (
    select 1 from public.inspection_checklists c
    where c.id = checklist_id and c.project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  ));

-- consultancy_reports: read any member; insert/update/delete managers.
drop policy if exists rep_read on public.consultancy_reports;
create policy rep_read on public.consultancy_reports for select
  using (project_id in (select public.user_project_ids()));

drop policy if exists rep_insert on public.consultancy_reports;
create policy rep_insert on public.consultancy_reports for insert
  with check (
    project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  );

drop policy if exists rep_update on public.consultancy_reports;
create policy rep_update on public.consultancy_reports for update
  using (
    project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  )
  with check (
    project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  );

drop policy if exists rep_delete on public.consultancy_reports;
create policy rep_delete on public.consultancy_reports for delete
  using (
    project_id in (select public.user_project_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
  );

-- Grants: DML to authenticated; anon nothing.
grant select, insert, update, delete on public.inspection_checklists to authenticated;
grant select, insert, update, delete on public.inspection_results to authenticated;
grant select, insert, update, delete on public.consultancy_reports to authenticated;
revoke all on public.inspection_checklists from anon;
revoke all on public.inspection_results from anon;
revoke all on public.consultancy_reports from anon;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.consultancy_reports;
  RAISE NOTICE '163_consultancy_audits: reports_rows=%', n;
END $$;

COMMIT;