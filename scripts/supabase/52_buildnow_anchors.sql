-- Sprint 2 (Session 30.3) — BuildNow Telangana anchors.
--
-- BuildNow Telangana (buildnow.telangana.gov.in, Feb 2025) is the state's
-- unified approval portal. Per research workflow wz3yologq, it uses
-- blockchain audit trails + WhatsApp-first status updates as core
-- features — direct govt precedent for SiteTrack Pro's two main
-- differentiators.
--
-- This table mirrors a project's BuildNow status into our DB so:
--   - The DPR detail view can show a "BuildNow verified" badge.
--   - The handover packet (Sprint 4) can include current approval state.
--   - We can detect status drift between our records and the state portal.
--
-- Schema choices:
--  - PK is (project_id, sync_date) — one snapshot per project per day.
--  - raw_payload is jsonb so the BuildNow shape can evolve without
--    schema migrations.
--  - Source = 'api' | 'scrape' tracks whether we used official API
--    access or fallback Playwright scraping.

BEGIN;

create table if not exists buildnow_anchors (
  project_id uuid not null references projects(id) on delete cascade,
  sync_date date not null default current_date,
  buildnow_project_id text not null,             -- the ID from BuildNow side
  -- Mirrored status
  approval_status text,                          -- 'submitted' | 'under_review' | 'approved' | 'rejected'
  current_stage text,                            -- e.g. 'commencement_certificate'
  expected_completion_date date,
  promoter_name text,                            -- from BuildNow public data
  project_address text,
  rera_registration text,
  -- Source tracking
  source text not null check (source in ('api','scrape','manual')),
  raw_payload jsonb,                             -- raw BuildNow response
  -- Anchor hash — sha256 of canonical payload, used by handover packet
  anchor_hash text not null,
  fetched_at timestamptz not null default now(),
  primary key (project_id, sync_date)
);

comment on table buildnow_anchors is
  'Sprint 2: daily snapshots of a project''s BuildNow Telangana status. PK = (project_id, sync_date) — idempotent re-sync.';

create index if not exists idx_buildnow_anchors_buildnow_id on buildnow_anchors (buildnow_project_id);
create index if not exists idx_buildnow_anchors_status on buildnow_anchors (approval_status);
create index if not exists idx_buildnow_anchors_fetched on buildnow_anchors (fetched_at desc);

-- ── RLS: org-scoped via project's org ──────────────────────────────────────
alter table buildnow_anchors enable row level security;
drop policy if exists buildnow_anchors_read on buildnow_anchors;
create policy buildnow_anchors_read on buildnow_anchors
  for select to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = buildnow_anchors.project_id
      and p.org_id = (select org_id from profiles where id = auth.uid())
    )
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

-- Writes only via service-role (Edge Function).

-- ── Helper: latest anchor for a project ────────────────────────────────────
create or replace function buildnow_latest_for_project(p_project_id uuid)
returns table (
  buildnow_project_id text,
  approval_status text,
  current_stage text,
  fetched_at timestamptz,
  anchor_hash text,
  source text
)
language sql stable as $$
  select buildnow_project_id, approval_status, current_stage, fetched_at, anchor_hash, source
  from buildnow_anchors
  where project_id = p_project_id
  order by sync_date desc
  limit 1;
$$;

comment on function buildnow_latest_for_project(uuid) is
  'Sprint 2: returns the most recent BuildNow snapshot for a project. Used by DPR detail view + handover packet (Sprint 4).';

-- ── Drift detection: stale anchors that need re-fetch ──────────────────────
create or replace function buildnow_stale_anchors(p_org_id uuid, p_max_age_hours int default 24)
returns table (
  project_id uuid,
  buildnow_project_id text,
  last_fetched_at timestamptz,
  hours_since_fetch numeric
)
language sql stable as $$
  select
    project_id,
    buildnow_project_id,
    fetched_at as last_fetched_at,
    extract(epoch from (now() - fetched_at)) / 3600.0 as hours_since_fetch
  from (
    select distinct on (project_id)
      project_id, buildnow_project_id, fetched_at
    from buildnow_anchors
    where exists (
      select 1 from projects p
      where p.id = buildnow_anchors.project_id
      and p.org_id = p_org_id
    )
    order by project_id, sync_date desc
  ) latest
  where fetched_at < now() - (p_max_age_hours * interval '1 hour');
$$;

comment on function buildnow_stale_anchors(uuid, int) is
  'Sprint 2: lists projects whose BuildNow anchor is older than threshold. Cron job uses this to schedule re-sync.';

COMMIT;
