-- SiteTrack Pro — v4 Phase E4: deliverable / drawing download audit.
-- Run AFTER 158_po_receipts.sql (no dependency, but keeps numbering order). Idempotent.
--
-- Adds a `download_events` register that records who downloaded which file from
-- the shared `deliverables` storage bucket, and from which register row
-- (deliverable vs drawing). The frontend logs an event on every signed-URL
-- download (DeliverablesTab / DrawingsTab); the org Download Audit view rolls
-- the register up across the caller's member projects.
--
-- RLS: read = any member of the file's project (can_read_project); insert =
-- the downloader themself (`downloaded_by = auth.uid()`) AND a project member;
-- no update/delete (append-only audit trail).

BEGIN;

-- ── 1. download_events table ────────────────────────────────────────────────
create table if not exists public.download_events (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  register      text not null check (register in ('deliverable', 'drawing')),
  ref_id        uuid not null,
  file_name     text not null,
  file_path     text not null,
  size_bytes    bigint not null default 0 check (size_bytes >= 0),
  downloaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  downloaded_at timestamptz not null default now()
);

create index if not exists idx_download_events_project_at on public.download_events(project_id, downloaded_at desc);
create index if not exists idx_download_events_register on public.download_events(register);

alter table public.download_events enable row level security;

-- Read: any member of the project owning the downloaded file.
drop policy if exists download_events_read on public.download_events;
create policy download_events_read on public.download_events for select
  using (public.can_read_project(project_id));

-- Insert: the caller can only log a download they performed (auth.uid()), and
-- only for a project they're a member of.
drop policy if exists download_events_insert on public.download_events;
create policy download_events_insert on public.download_events for insert
  with check (public.can_read_project(project_id) AND downloaded_by = auth.uid());

-- Append-only: no update / delete policies at all.

-- Grants: authenticated gets select + insert; anon gets nothing.
grant select, insert on public.download_events to authenticated;
revoke all on public.download_events from anon;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.download_events;
  RAISE NOTICE '159_download_events: download_events_rows=%', n;
END $$;

COMMIT;
