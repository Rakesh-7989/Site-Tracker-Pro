-- SiteTrack Pro — Cloudflare D1 Migration 0016
-- Spatial hierarchy (blocks, floors, units), site operations (diary, snapshots,
-- equipment, issues, punch, checklist_items, submittals, worklogs, attachments,
-- comments, activity_log, voice_transcripts, teams).
PRAGMA foreign_keys = ON;

-- ── 1. Spatial Hierarchy (Blocks -> Floors -> Units) ──────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blocks_project ON blocks(project_id);

CREATE TABLE IF NOT EXISTS floors (
  id         TEXT PRIMARY KEY,
  block_id   TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  level      INTEGER NOT NULL,
  name       TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_floors_block ON floors(block_id);

CREATE TABLE IF NOT EXISTS units (
  id          TEXT PRIMARY KEY,
  floor_id    TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  unit_code   TEXT NOT NULL,
  unit_type   TEXT,
  carpet_sqft REAL,
  status      TEXT DEFAULT 'open',
  notes       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_units_floor ON units(floor_id);

-- ── 2. Site Diary & Daily Snapshots ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diary (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  author_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  weather       TEXT,
  temperature_c REAL,
  workers_count INTEGER,
  visitors      TEXT,
  events        TEXT,
  delays        TEXT,
  safety_notes  TEXT,
  next_day_plan TEXT,
  attachments   TEXT, -- JSON
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_diary_project_date ON diary(project_id, date DESC);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  progress      REAL,
  spend         REAL,
  labour_count  INTEGER,
  open_issues   INTEGER,
  weather       TEXT,
  materials_in  TEXT, -- JSON
  materials_out TEXT, -- JSON
  summary       TEXT,
  payload       TEXT, -- JSON
  frozen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  frozen_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (project_id, snapshot_date)
);

-- ── 3. Equipment, Issues, Punch, Checklist Items, Submittals ──────────────────
CREATE TABLE IF NOT EXISTS equipment (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  asset_no         TEXT,
  type             TEXT,
  ownership        TEXT,
  vendor_id        TEXT,
  rate_per_day     REAL,
  on_site_from     TEXT,
  on_site_to       TEXT,
  status           TEXT DEFAULT 'active',
  last_maintenance TEXT,
  next_maintenance TEXT,
  operator_name    TEXT,
  meter_unit       TEXT,
  meter_reading    REAL,
  notes            TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_equipment_project ON equipment(project_id);

CREATE TABLE IF NOT EXISTS issues (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  severity      TEXT DEFAULT 'medium',
  status        TEXT DEFAULT 'open',
  reported_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_date TEXT,
  resolved_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_date TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id, status);

CREATE TABLE IF NOT EXISTS punch (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  unit_id       TEXT REFERENCES units(id) ON DELETE SET NULL,
  location      TEXT NOT NULL,
  trade         TEXT,
  defect        TEXT NOT NULL,
  severity      TEXT DEFAULT 'minor',
  reported_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_date TEXT,
  assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date      TEXT,
  status        TEXT DEFAULT 'open',
  resolved_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_date TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_punch_project ON punch(project_id, status);

CREATE TABLE IF NOT EXISTS checklist_items (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id     TEXT,
  category        TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  stage           TEXT,
  sort_order      INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'pending',
  required        INTEGER DEFAULT 0,
  due_date        TEXT,
  completed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at    TEXT,
  verified_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at     TEXT,
  attachments_ref TEXT, -- JSON
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_project ON checklist_items(project_id);

CREATE TABLE IF NOT EXISTS submittals (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no            TEXT NOT NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  drawing_id    TEXT,
  submitted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at  TEXT,
  reviewer_role TEXT,
  status        TEXT DEFAULT 'pending',
  reviewed_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TEXT,
  comments      TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submittals_project ON submittals(project_id);

-- ── 4. Worklogs, Attachments, Comments, Activity Log, Voice, Teams ────────────
CREATE TABLE IF NOT EXISTS worklogs (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  activity   TEXT NOT NULL,
  task_id    TEXT,
  hours      REAL NOT NULL,
  notes      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_worklogs_project_date ON worklogs(project_id, date DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  original_name TEXT,
  size          INTEGER,
  mime          TEXT,
  kind          TEXT,
  geo           TEXT, -- JSON
  uploaded_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  parent_id   TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,
  body        TEXT NOT NULL,
  edited_at   TEXT,
  deleted_at  TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type          TEXT,
  action        TEXT,
  detail        TEXT,
  by_profile_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  by_name       TEXT,
  by_role       TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_transcripts (
  audio_sha256    TEXT PRIMARY KEY,
  language        TEXT NOT NULL,
  transcript_text TEXT NOT NULL,
  confidence      REAL NOT NULL,
  provider        TEXT NOT NULL,
  duration_ms     INTEGER,
  org_id_first    TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  attempts_count  INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_hit_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  trade      TEXT,
  lead_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  members    TEXT, -- JSON
  active     INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_teams_project ON teams(project_id);
