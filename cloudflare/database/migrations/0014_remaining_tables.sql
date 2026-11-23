-- SiteTrack Pro — Cloudflare D1 Migration 0014
-- Platform settings, plan upgrade requests, staff area grants, vendor profiles,
-- download events, mood boards, interior rooms/installations, inspection
-- checklists/results, consultancy reports, handover signatures, rbac profile
-- assignments
--
-- Translated from Supabase migrations:
--   105_platform_settings.sql (platform_settings)
--   103_plan_upgrade_requests.sql (plan_upgrade_requests)
--   106_staff_area_grants.sql (staff_area_grants)
--   126_role_crud_finegrained.sql (vendor_profiles)
--   159_download_events.sql (download_events)
--   162_interior_boards.sql (mood_boards, interior_rooms, room_installations)
--   163_consultancy_audits.sql (inspection_checklists, inspection_results, consultancy_reports)
--   185_client_approvals.sql (handover_signatures)
--   205_rbac_v2_assignments.sql (rbac_profile_assignments)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - bigint -> INTEGER
--   - text[] -> TEXT (JSON array stored as text)
--   - gen_random_uuid() -> application generates UUIDs
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks, triggers, RPCs
--   - Removed ALTER TABLE on payments (payments_method_check managed separately)
--   - Removed organizations.enabled_modules CHECK ALTER (managed separately)
--   - auth.users/profiles -> users
--   - ALTER TABLE columns on existing tables: run once (D1 has no IF NOT EXISTS for columns)
PRAGMA foreign_keys = ON;

-- ── 1. Platform settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 2. Plan upgrade requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_upgrade_requests (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  current_plan     TEXT,
  desired_plan     TEXT,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  assigned_staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS pur_org_idx ON plan_upgrade_requests(org_id);
CREATE INDEX IF NOT EXISTS pur_status_idx ON plan_upgrade_requests(status);

-- ── 3. Staff area grants ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_area_grants (
  staff_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area       TEXT NOT NULL CHECK (area IN ('signups','orgs','users','roles','upgrades')),
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (staff_id, area)
);

-- ── 4. Vendor profiles ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_profiles (
  profile_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 5. Download events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS download_events (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  register      TEXT NOT NULL CHECK (register IN ('deliverable','drawing')),
  ref_id        TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  downloaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_download_events_project_at ON download_events(project_id, downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_events_register ON download_events(register);

-- ── 6. Mood boards ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mood_boards (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  theme      TEXT,
  media_url  TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mood_boards_project ON mood_boards(project_id);

-- ── 7. Interior rooms ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interior_rooms (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  area        REAL,
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','installed','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interior_rooms_project ON interior_rooms(project_id);

-- ── 8. Room installations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_installations (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES interior_rooms(id) ON DELETE CASCADE,
  item_name   TEXT NOT NULL,
  planned_date TEXT,
  done_date   TEXT,
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_room_installations_room ON room_installations(room_id);

-- ── 9. Inspection checklists ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_checklists (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inspection_checklists_project ON inspection_checklists(project_id);

-- ── 10. Inspection results ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_results (
  id             TEXT PRIMARY KEY,
  checklist_id   TEXT NOT NULL REFERENCES inspection_checklists(id) ON DELETE CASCADE,
  item           TEXT NOT NULL,
  result         TEXT NOT NULL CHECK (result IN ('pass','fail','na')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inspection_results_checklist ON inspection_results(checklist_id);

-- ── 11. Consultancy reports ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultancy_reports (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('site_visit','recommendation','milestone_review')),
  title       TEXT NOT NULL,
  summary     TEXT,
  content     TEXT,
  period_from TEXT,
  period_to   TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consultancy_reports_project ON consultancy_reports(project_id);

-- ── 12. Handover signatures ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handover_signatures (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  signature_data TEXT NOT NULL,
  signed_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  signed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_handover_signatures_project ON handover_signatures(project_id);

-- ── 13. RBAC profile assignments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_profile_assignments (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     TEXT NOT NULL REFERENCES rbac_role_profiles(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_rbac_profile_assignments_profile ON rbac_profile_assignments(profile_id);
