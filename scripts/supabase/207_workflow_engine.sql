-- SiteTrack Pro — VNext P1.1: workflow engine substrate (migration 207).
-- Adds the declarative workflow persistence layer behind the frontend
-- workflowEngine.ts / workflowDefinitions.ts register:
--
--   workflow_definitions  — persisted catalog of declare-first workflow defs
--                           (id, name, initial_state, states jsonb, transitions jsonb)
--   workflow_instances    — per-entity current state (workflow_id + entity_type/entity_id,
--                           scoped by project_id or organization_id for RLS)
--   workflow_transitions  — append-only audit log of state changes
--
-- RLS mirrors the project/org member posture used across the app
-- (can_read_project / user_org_ids). Definitions are a read-only catalog
-- (any authenticated member can read; no writes). Instances + transitions are
-- member-scoped read/write, delete withheld (state history is preserved).
--
-- Run after 206_spatial_hierarchy.sql. Idempotent.
-- Seed values mirror src/app/workflowDefinitions.ts (single source of truth).

BEGIN;

-- ── 1. workflow_definitions ────────────────────────────────────────────────
create table if not exists public.workflow_definitions (
  id             text primary key,
  name           text not null,
  description    text,
  initial_state  text not null,
  states         jsonb not null default '[]'::jsonb,
  transitions    jsonb not null default '[]'::jsonb,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ── 2. workflow_instances ──────────────────────────────────────────────────
create table if not exists public.workflow_instances (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     text not null references public.workflow_definitions(id) on delete restrict,
  entity_type     text not null,
  entity_id       uuid not null,
  current_state   text not null,
  project_id      uuid references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workflow_id, entity_type, entity_id)
);

-- ── 3. workflow_transitions (append-only audit) ────────────────────────────
create table if not exists public.workflow_transitions (
  id              uuid primary key default gen_random_uuid(),
  instance_id     uuid not null references public.workflow_instances(id) on delete cascade,
  from_state      text not null,
  to_state        text not null,
  transitioned_by uuid references auth.users(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_workflow_transitions_instance
  on public.workflow_transitions(instance_id, created_at);

-- ── 4. RLS ─────────────────────────────────────────────────────────────────
alter table public.workflow_definitions enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_transitions enable row level security;

-- Definitions: read-only catalog for authenticated members.
drop policy if exists workflow_defs_select on public.workflow_definitions;
create policy workflow_defs_select on public.workflow_definitions
  for select to authenticated using (true);

-- Instances: member-scoped (org or project), read + insert + update, no delete.
drop policy if exists workflow_instances_select on public.workflow_instances;
create policy workflow_instances_select on public.workflow_instances
  for select to authenticated
  using (
    (organization_id is null or organization_id = any(user_org_ids()))
    and (project_id is null or public.can_read_project(project_id))
  );

drop policy if exists workflow_instances_insert on public.workflow_instances;
create policy workflow_instances_insert on public.workflow_instances
  for insert to authenticated
  with check (
    (organization_id is null or organization_id = any(user_org_ids()))
    and (project_id is null or public.can_read_project(project_id))
  );

drop policy if exists workflow_instances_update on public.workflow_instances;
create policy workflow_instances_update on public.workflow_instances
  for update to authenticated
  using (
    (organization_id is null or organization_id = any(user_org_ids()))
    and (project_id is null or public.can_read_project(project_id))
  )
  with check (
    (organization_id is null or organization_id = any(user_org_ids()))
    and (project_id is null or public.can_read_project(project_id))
  );

-- Transitions: member-scoped read + insert (audit), no update/delete.
drop policy if exists workflow_transitions_select on public.workflow_transitions;
create policy workflow_transitions_select on public.workflow_transitions
  for select to authenticated
  using (
    exists (
      select 1 from public.workflow_instances wi
      where wi.id = instance_id
        and (wi.organization_id is null or wi.organization_id = any(user_org_ids()))
        and (wi.project_id is null or public.can_read_project(wi.project_id))
    )
  );

drop policy if exists workflow_transitions_insert on public.workflow_transitions;
create policy workflow_transitions_insert on public.workflow_transitions
  for insert to authenticated
  with check (
    transitioned_by = auth.uid()
    and exists (
      select 1 from public.workflow_instances wi
      where wi.id = instance_id
        and (wi.organization_id is null or wi.organization_id = any(user_org_ids()))
        and (wi.project_id is null or public.can_read_project(wi.project_id))
    )
  );

-- ── 5. Grants ──────────────────────────────────────────────────────────────
grant select on public.workflow_definitions to authenticated;
grant select, insert, update on public.workflow_instances to authenticated;
grant select, insert on public.workflow_transitions to authenticated;
revoke all on public.workflow_definitions from anon;
revoke all on public.workflow_instances from anon;
revoke all on public.workflow_transitions from anon;

-- ── 6. Seed catalog (mirrors src/app/workflowDefinitions.ts) ───────────────
insert into public.workflow_definitions (id, name, description, initial_state, states, transitions)
values
  ('material_request', 'Material request', 'requested → approved → ordered → received ladder', 'requested',
   '["requested","approved","ordered","received"]',
   '[{"from":"requested","to":"approved"},{"from":"approved","to":"ordered"},{"from":"ordered","to":"received"}]'),
  ('corrective_action', 'Corrective action', 'open → in_progress → resolved → verified ladder', 'open',
   '["open","in_progress","resolved","verified"]',
   '[{"from":"open","to":"in_progress"},{"from":"in_progress","to":"resolved"},{"from":"resolved","to":"verified"}]'),
  ('statutory', 'Statutory approval', 'draft → applied → approved/rejected → expired NOC ladder', 'draft',
   '["draft","applied","approved","rejected","expired"]',
   '[{"from":"draft","to":"applied"},{"from":"applied","to":"approved","primary":true},{"from":"applied","to":"rejected"},{"from":"approved","to":"expired"}]'),
  ('retainer', 'Retainer', 'active ⇄ paused; cancelled is terminal', 'active',
   '["active","paused","cancelled"]',
   '[{"from":"active","to":"paused"},{"from":"paused","to":"active"}]'),
  ('checklist', 'Inspection checklist', 'draft → in_progress → passed/failed; cancelled reopens to draft', 'draft',
   '["draft","in_progress","passed","failed","cancelled"]',
   '[{"from":"draft","to":"in_progress"},{"from":"in_progress","to":"passed","primary":true},{"from":"in_progress","to":"failed"},{"from":"passed","to":"passed"},{"from":"failed","to":"failed"},{"from":"cancelled","to":"draft"}]'),
  ('report', 'Consultancy report', 'draft → published → archived ladder', 'draft',
   '["draft","published","archived"]',
   '[{"from":"draft","to":"published"},{"from":"published","to":"archived"},{"from":"archived","to":"archived"}]'),
  ('lead', 'CRM lead', 'funnel new → … → won; lost is terminal', 'new',
   '["new","contacted","meeting_scheduled","quotation_sent","negotiating","agreement_signed","won","lost"]',
   '[{"from":"new","to":"contacted"},{"from":"contacted","to":"meeting_scheduled"},{"from":"meeting_scheduled","to":"quotation_sent"},{"from":"quotation_sent","to":"negotiating"},{"from":"negotiating","to":"agreement_signed"},{"from":"agreement_signed","to":"won"}]'),
  ('quote', 'Procurement quote', 'requested → received → selected; rejected re-enters received', 'requested',
   '["requested","received","selected","rejected"]',
   '[{"from":"requested","to":"received"},{"from":"received","to":"selected","primary":true},{"from":"received","to":"rejected"},{"from":"selected","to":"rejected"},{"from":"rejected","to":"received"}]'),
  ('install', 'FF&E install', 'planned → ordered → installed; cancelled reopens to planned', 'planned',
   '["planned","ordered","installed","cancelled"]',
   '[{"from":"planned","to":"ordered"},{"from":"ordered","to":"installed"},{"from":"installed","to":"installed"},{"from":"cancelled","to":"planned"}]'),
  ('room_finish', 'Room finish', 'planned → in_progress → installed; cancelled reopens to planned', 'planned',
   '["planned","in_progress","installed","cancelled"]',
   '[{"from":"planned","to":"in_progress"},{"from":"in_progress","to":"installed"},{"from":"installed","to":"installed"},{"from":"cancelled","to":"planned"}]')
on conflict (id) do update
  set name = excluded.name, description = excluded.description,
      initial_state = excluded.initial_state, states = excluded.states,
      transitions = excluded.transitions, enabled = true;

-- ── 7. Verification notice ─────────────────────────────────────────────────
DO $$ DECLARE
  d int; i int; t int;
BEGIN
  select count(*) into d from public.workflow_definitions;
  select count(*) into i from public.workflow_instances;
  select count(*) into t from public.workflow_transitions;
  raise notice '207_workflow_engine: definitions=%, instances=%, transitions=%', d, i, t;
END $$;

COMMIT;