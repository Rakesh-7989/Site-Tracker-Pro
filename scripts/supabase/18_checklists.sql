-- SiteTrack Pro — Checklists (templated + per-project instantiated).
-- Run AFTER 17_handover_tables.sql. Idempotent.
--
-- Mirrors INIT_CHECKLISTS seed and the template kind 'checklist' from
-- 03_rls_phase1.sql.

create table if not exists checklist_items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  template_id     uuid references templates(id) on delete set null,   -- traceable to org template
  category        text,                                              -- safety / quality / handover / boq-stage
  title           text not null,
  description     text,
  stage           text,                                              -- foundation/plinth/slab-1/finishing/...
  sort_order      int default 0,
  status          text default 'pending'
    check (status in ('pending','in_progress','completed','na','blocked')),
  required        boolean default false,
  due_date        date,
  completed_by    uuid references profiles(id),
  completed_at    timestamptz,
  verified_by     uuid references profiles(id),
  verified_at     timestamptz,
  attachments_ref jsonb default '[]'::jsonb,
  notes           text,
  created_at      timestamptz default now()
);

create index if not exists idx_checklist_project_stage on checklist_items(project_id, stage);
create index if not exists idx_checklist_project_status on checklist_items(project_id, status);

alter table checklist_items enable row level security;

drop policy if exists checklist_read on checklist_items;
create policy checklist_read on checklist_items for select
  using (project_id in (select user_project_ids()));

drop policy if exists checklist_write on checklist_items;
create policy checklist_write on checklist_items for all
  using (project_id in (select user_project_ids()))
  with check (project_id in (select user_project_ids()));

do $$ declare n int; begin
  select count(*) into n from checklist_items;
  raise notice '18_checklists: ready. % checklist item(s).', n;
end $$;