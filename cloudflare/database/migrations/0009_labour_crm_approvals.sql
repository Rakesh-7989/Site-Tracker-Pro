-- SiteTrack Pro — Cloudflare D1 Migration 0009
-- Inspections, labour, attendance, RA bills, CRM leads, client approval
--
-- Translated from Supabase migrations:
--   16_process_tables.sql (inspections, rfi, change_orders, safety)
--   01_schema.sql (labour_register, ra_bills, invoices)
--   20_workforce.sql (attendance)
--   161_crm_leads.sql (leads, lead_meetings, lead_quotations, lead_agreements)
--   185_client_approvals.sql (drawing_comments, share_links)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - bigint/numeric -> INTEGER/REAL
--   - jsonb -> TEXT
--   - date/time -> TEXT
--   - gen_random_uuid() -> application generates UUIDs
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks, triggers
--   - Removed pgcrypto extension (pgcrypto not in D1; share_links password_hash
--     handled in application code)
--   - Removed ALTER TABLE drawings columns (already in D1 0003 or handled separately)
--   - Removed references to auth.users/profiles -> users
PRAGMA foreign_keys = ON;

-- ── 1. Inspections ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspections (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type           TEXT NOT NULL, -- structural / safety / quality / handover
  scheduled_date TEXT,
  conducted_date TEXT,
  inspector_name TEXT,
  inspector_id   TEXT REFERENCES users(id),
  scope          TEXT,
  result         TEXT CHECK (result IN ('pending','pass','fail','conditional')),
  observations   TEXT,
  follow_ups     TEXT DEFAULT '[]', -- JSON array stored as text
  status         TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inspections_project_date ON inspections(project_id, scheduled_date DESC);

-- ── 2. RFI ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfi (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no           TEXT NOT NULL,
  subject      TEXT NOT NULL,
  question     TEXT NOT NULL,
  category     TEXT,
  asked_by     TEXT REFERENCES users(id),
  asked_at     TEXT,
  due_date     TEXT,
  status       TEXT DEFAULT 'open' CHECK (status IN ('open','answered','closed','overdue')),
  response     TEXT,
  responded_by TEXT REFERENCES users(id),
  responded_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rfi_project_status ON rfi(project_id, status);

-- ── 3. Change orders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_orders (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no           TEXT NOT NULL,
  description  TEXT NOT NULL,
  scope_change TEXT,
  cost_impact  INTEGER,
  schedule_impact INTEGER,
  reason       TEXT,
  raised_by    TEXT REFERENCES users(id),
  raised_at    TEXT,
  status       TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','cancelled')),
  approved_by  TEXT REFERENCES users(id),
  approved_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_co_project_status ON change_orders(project_id, status);

-- ── 4. Safety incidents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  incident_date TEXT NOT NULL DEFAULT (date('now')),
  severity     TEXT NOT NULL CHECK (severity IN ('near_miss','first_aid','minor','major','fatal')),
  category     TEXT,
  description  TEXT NOT NULL,
  location     TEXT,
  reported_by  TEXT REFERENCES users(id),
  action_taken TEXT,
  follow_ups   TEXT DEFAULT '[]',
  status       TEXT DEFAULT 'open' CHECK (status IN ('open','resolved','escalated')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_safety_project_date ON safety(project_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_safety_severity ON safety(severity);

-- ── 5. Labour register ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labour_register (
  id      TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  aadhaar TEXT,
  epf     TEXT,
  esi     TEXT,
  trade   TEXT,
  wage    REAL,
  joined  TEXT
);

-- ── 6. Attendance ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  attendee_kind TEXT NOT NULL CHECK (attendee_kind IN ('labour','staff','visitor')),
  labour_id     TEXT REFERENCES labour_register(id) ON DELETE CASCADE,
  profile_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  attendee_name TEXT NOT NULL,
  date          TEXT NOT NULL DEFAULT (date('now')),
  status        TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','half_day','leave','on_site_late','off_site')),
  in_time       TEXT,
  out_time      TEXT,
  hours         REAL,
  source        TEXT,
  geo           TEXT, -- JSON stored as text
  recorded_by   TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (attendee_kind = 'labour' AND labour_id IS NOT NULL)
    OR (attendee_kind = 'staff' AND profile_id IS NOT NULL)
    OR attendee_kind = 'visitor'
  )
);

CREATE INDEX IF NOT EXISTS idx_attendance_project_date ON attendance(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_labour ON attendance(labour_id, date DESC) WHERE labour_id IS NOT NULL;

-- ── 7. RA bills ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ra_bills (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  no           TEXT NOT NULL,
  subcontractor TEXT,
  scope        TEXT,
  bill_amount  INTEGER NOT NULL,
  cumulative   INTEGER,
  retention_pct REAL DEFAULT 5,
  paid_amount  INTEGER DEFAULT 0,
  status       TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','approved','paid','rejected')),
  bill_date    TEXT DEFAULT (date('now'))
);

-- ── 8. CRM: Leads ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  company       TEXT,
  phone         TEXT,
  email         TEXT,
  source        TEXT CHECK (source IN ('referral','website','walk_in','call','whatsapp','event','other')),
  budget        INTEGER CHECK (budget IS NULL OR budget >= 0),
  stage         TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','meeting_scheduled','quotation_sent','negotiating','agreement_signed','won','lost')),
  notes         TEXT,
  owner_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  won_amount    INTEGER CHECK (won_amount IS NULL OR won_amount >= 0),
  lost_reason   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_org_stage ON leads(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_id);

-- ── 9. CRM: Lead meetings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_meetings (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  scheduled_at  TEXT NOT NULL,
  agenda        TEXT,
  outcome       TEXT CHECK (outcome IN ('pending','done','cancelled','no_show')),
  notes         TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_meetings_lead ON lead_meetings(lead_id);

-- ── 10. CRM: Lead quotations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_quotations (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  -- more columns from 161...
  amount        INTEGER,
  status        TEXT DEFAULT 'draft',
  valid_until   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_quotations_lead ON lead_quotations(lead_id);

-- ── 11. CRM: Lead agreements ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_agreements (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','signed','expired')),
  signed_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_agreements_lead ON lead_agreements(lead_id);

-- ── 12. Drawing comments (Figma-style x/y pins) ───────────────────────────────
CREATE TABLE IF NOT EXISTS drawing_comments (
  id          TEXT PRIMARY KEY,
  drawing_id  TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES drawing_comments(id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  x           REAL CHECK (x IS NULL OR (x >= 0 AND x <= 1)),
  y           REAL CHECK (y IS NULL OR (y >= 0 AND y <= 1)),
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  resolved_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drawing_comments_drawing ON drawing_comments(drawing_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_drawing_comments_thread ON drawing_comments(parent_id) WHERE parent_id IS NOT NULL;

-- ── 13. Share links (guarded project share links) ─────────────────────────────
CREATE TABLE IF NOT EXISTS share_links (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  label         TEXT,
  password_hash TEXT,
  otp           TEXT,
  otp_expires_at TEXT,
  expires_at    TEXT,
  allow_download INTEGER NOT NULL DEFAULT 1,
  max_views     INTEGER CHECK (max_views IS NULL OR max_views > 0),
  views         INTEGER NOT NULL DEFAULT 0,
  revoked_at    TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_share_links_project ON share_links(project_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
