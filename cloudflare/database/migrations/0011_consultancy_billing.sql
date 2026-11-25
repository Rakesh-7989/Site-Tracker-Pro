-- SiteTrack Pro — Cloudflare D1 Migration 0011
-- Time tracking, fee phases, deliverables, review rounds, rate cards,
-- retainers, invoice lines (Consultancy C1-C3 stack)
--
-- Translated from Supabase migrations:
--   137_time_entries.sql (time_entries)
--   138_fee_phases.sql (fee_phases + invoices.phase_id)
--   139_deliverables_reviews.sql (deliverables, review_rounds)
--   141_rate_cards_time_approval.sql (rate_cards)
--   142_retainers_invoice_generation.sql (retainers)
--   146_invoice_lines.sql (invoice_lines)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - numeric(x,y) -> REAL/INTEGER
--   - boolean -> INTEGER (0/1)
--   - date -> TEXT
--   - gen_random_uuid() -> application generates UUIDs
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks
--   - auth.users/profiles -> users
--   - invoices.phase_id ALTER TABLE: invoices table already exists in D1 0003
PRAGMA foreign_keys = ON;

-- ── 1. Time entries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL DEFAULT (date('now')),
  activity    TEXT NOT NULL,
  hours       REAL NOT NULL CHECK (hours > 0 AND hours <= 24),
  billable    INTEGER NOT NULL DEFAULT 1,  -- 1 = true, 0 = false
  rate        REAL,                        -- ₹ / hour, snapshot at log time
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_project_date ON time_entries(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_profile_date ON time_entries(profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON time_entries(project_id, billable) WHERE billable = 1;

-- ── 2. Fee phases (fixed-fee engagement phases) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_phases (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  scope           TEXT,
  fee_amount      INTEGER NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','in_progress','completed','cancelled')),
  due_date        TEXT,
  completed_date  TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fee_phases_project ON fee_phases(project_id, sort_order, id);

-- invoices.phase_id column added separately (D1 ALTER TABLE - run once)
ALTER TABLE invoices ADD COLUMN phase_id TEXT REFERENCES fee_phases(id) ON DELETE SET NULL;

-- ── 3. Deliverables ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverables (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id    TEXT REFERENCES fee_phases(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('drawing','spec','report','model','schedule','certificate','other')),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected','issued')),
  due_date    TEXT,
  owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deliverables_project ON deliverables(project_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_deliverables_phase ON deliverables(phase_id) WHERE phase_id IS NOT NULL;

-- ── 4. Review rounds ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_rounds (
  id             TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  round_no       INTEGER NOT NULL CHECK (round_no > 0),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  requested_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  comments       TEXT,
  closed_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  closed_at      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (deliverable_id, round_no)
);

CREATE INDEX IF NOT EXISTS idx_review_rounds_deliverable ON review_rounds(deliverable_id, round_no);

-- ── 5. Rate cards ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_cards (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rate           REAL NOT NULL CHECK (rate >= 0),
  effective_from TEXT NOT NULL DEFAULT (date('now')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, profile_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_project ON rate_cards(project_id, profile_id, effective_from DESC);

-- ── 6. Retainers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retainers (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  monthly_amount INTEGER NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  start_date     TEXT NOT NULL DEFAULT (date('now')),
  end_date       TEXT,
  billing_day    INTEGER NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_retainers_project ON retainers(project_id, status);

-- ── 7. Invoice lines ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_lines (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  amount      INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id, sort_order);
