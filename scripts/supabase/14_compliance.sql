-- SiteTrack Pro — Compliance tracking (RERA / GST / EPFO / PAN).
-- Run AFTER 13_daily_snapshots.sql. Idempotent.
--
-- Mirrors src/lib/compliance.js + src/lib/reraTelangana.js + INIT_COMPLIANCE.
-- Dual-purpose: an org-level row (project_id NULL) tracks org GST / EPFO
-- registration; a project-level row tracks per-project RERA filing stages.

create table if not exists compliance (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid references projects(id) on delete cascade,    -- nullable for org-level rows
  kind         text not null check (kind in ('rera','gst','epfo','pan','other')),
  ref_no       text,                                              -- e.g. RERA P02400003456, GSTIN, PAN
  stage        text,                                              -- for RERA: 'foundation','plinth','7th_floor',...
  status       text not null default 'pending'
    check (status in ('pending','filed','accepted','rejected','expired','renewal_due')),
  filed_at     timestamptz,
  accepted_at  timestamptz,
  expires_at   timestamptz,
  filed_by     uuid references profiles(id),
  payload      jsonb default '{}'::jsonb,                         -- portal response, attachments meta
  last_checked timestamptz,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  check (
    (project_id is null and kind in ('gst','epfo','pan','other'))
    or (project_id is not null)
  )
);

create index if not exists idx_compliance_org_kind on compliance(org_id, kind);
create index if not exists idx_compliance_project_kind on compliance(project_id, kind) where project_id is not null;
create index if not exists idx_compliance_status on compliance(status);
create index if not exists idx_compliance_expires on compliance(expires_at) where expires_at is not null;

alter table compliance enable row level security;

drop policy if exists compliance_read on compliance;
create policy compliance_read on compliance for select
  using (
    is_superadmin()
    or org_id = user_org_id()
    or project_id in (select user_project_ids())
  );

drop policy if exists compliance_write on compliance;
create policy compliance_write on compliance for all
  using (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (
      current_role_text() in ('pm','project_admin','project_head')
      and (project_id in (select user_project_ids()) or org_id = user_org_id())
    )
  )
  with check (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (
      current_role_text() in ('pm','project_admin','project_head')
      and (project_id in (select user_project_ids()) or org_id = user_org_id())
    )
  );

do $$ declare n int; begin
  select count(*) into n from compliance;
  raise notice '14_compliance: ready. % row(s).', n;
end $$;