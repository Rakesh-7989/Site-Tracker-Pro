-- SiteTrack Pro — Project estimates (versioned, pre-BOQ).
-- Run AFTER 21_field_ops.sql. Idempotent.
--
-- Mirrors INIT_ESTIMATE seed. Estimates are the BID snapshot — frozen at
-- contract sign-off and used as the baseline against which BOQ + actuals
-- are tracked. Multiple versions retained for accuracy analysis.

create table if not exists estimate (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  name          text not null,
  version       int not null default 1,
  total_amount  bigint not null,
  payload       jsonb not null default '{}'::jsonb,         -- {items: [...], notes, margin_pct}
  approved_at   timestamptz,
  approved_by   uuid references profiles(id),
  status        text default 'draft'
    check (status in ('draft','submitted','approved','superseded','rejected')),
  superseded_by uuid references estimate(id),
  created_by    uuid references profiles(id),
  created_at    timestamptz default now(),
  unique (project_id, name, version)
);

create index if not exists idx_estimate_project_version on estimate(project_id, version desc);
create index if not exists idx_estimate_status on estimate(status);

alter table estimate enable row level security;

drop policy if exists estimate_read on estimate;
create policy estimate_read on estimate for select
  using (project_id in (select user_project_ids()));

drop policy if exists estimate_write on estimate;
create policy estimate_write on estimate for all
  using (project_id in (select user_project_ids())
         and current_role_text() in (
           'architect','pm','project_admin','project_head','orgadmin','superadmin',
           'design_architect_interior','consultant','principal_consultant'
         ))
  with check (project_id in (select user_project_ids())
              and current_role_text() in (
                'architect','pm','project_admin','project_head','orgadmin','superadmin',
                'design_architect_interior','consultant','principal_consultant'
              ));

do $$ declare n int; begin
  select count(*) into n from estimate;
  raise notice '22_estimate: ready. % estimate version(s).', n;
end $$;