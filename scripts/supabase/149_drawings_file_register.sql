-- SiteTrack Pro — v4 Phase D1: storage-backed drawing file register.
-- Run AFTER 148_arch_segment_feature_caps.sql. Idempotent.
--
-- 1. ROW-READ RLS FIX: replace the legacy released_current read policies
--    (read_drawings_architect + read_drawings_role) with a project-membership
--    read that mirrors every other v4 table. Previously only identity role
--    'architect' could read ALL drawings and other roles could only read
--    rows where 'current' AND their identity role ∈ released_to — so
--    design_head/designer/mep/structural/pm could WRITE (v4_drawings_insert/
--    update, 126) but never READ their rows back, leaving the register empty
--    for everyone except architects.
--
--    Now: any project member reads all drawings in the project; the client
--    identity keeps the legacy released-to-client rule (only current drawings
--    whose released_to includes 'client'). Storage-level file read is already
--    member-gated on the `deliverables` bucket (145) by <project_id>/<...>.
--
-- 2. No storage changes: D1 reuses the `deliverables` bucket + its RLS
--    policies (145) — object path <project_id>/<drawing_id>/<file_name> keeps
--    the first path segment = project id, so member read/insert/update and
--    manager+orgadmin delete apply automatically.

BEGIN;

-- ── 1. Row-read policies ─────────────────────────────────────────────────────

drop policy if exists read_drawings_architect on drawings;
drop policy if exists read_drawings_role on drawings;
drop policy if exists read_drawings_member on drawings;
create policy read_drawings_member on drawings for select
  using (
    current_role_text() <> 'client'
    and project_id in (select user_project_ids())
  );

-- Client identity: only current drawings released to them (legacy rule,
-- preserved so a client never sees un-released or superseded drawings).
drop policy if exists read_drawings_released on drawings;
create policy read_drawings_released on drawings for select
  using (
    current_role_text() = 'client'
    and status = 'current'
    and 'client' = any (released_to)
    and project_id in (select user_project_ids())
  );

DO $$ BEGIN
  RAISE NOTICE '149_drawings_file_register: drawings read policies now member/released-client';
END $$;

COMMIT;