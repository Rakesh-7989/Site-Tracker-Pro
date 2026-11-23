-- SiteTrack Pro — Cloudflare D1 Migration 0008
-- Remaining critical tables: notifications, DPR messages/delivery, PO receipts,
-- material requests, corrective actions, shift roster, FF&E entries, statutory
-- approvals, procurement quotes, design workflow.
--
-- Translated from Supabase migrations:
--   89_notifications_bridge.sql (notifications grants)  → notifications table
--   157/158 area → dpr_messages, dpr_delivery_log (Sprint 2 DPR)
--   158_po_receipts.sql (po_receipts)
--   167_material_requests_grn.sql (material_requests)
--   168_construction_quality.sql (corrective_actions)
--   169_shift_roster.sql (shift_roster, attendance.overtime)
--   151_ffe_schedules.sql (ffe_entries)
--   152_statutory_approvals.sql (statutory_approvals)
--   153_procurement_quotes.sql (procurement_quotes)
--   165_design_workflow.sql (design_workflow)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - bigint/numeric -> INTEGER/REAL
--   - gen_random_uuid() -> application generates UUIDs
--   - date/time -> TEXT
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks, triggers
--   - Removed references to tables not yet in D1 (inspections, labour_register,
--     attendance) — those FKs are omitted; application code enforces integrity
--   - auth.users / public.profiles -> users (our D1 table)
PRAGMA foreign_keys = ON;

-- ── 1. Notifications (inbox) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  org_id      TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,
  read_at     TEXT,
  delivered_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ── 2. DPR messages (Sprint 2 daily progress report) ──────────────────────────
CREATE TABLE IF NOT EXISTS dpr_messages (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supervisor_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transcript_text TEXT,
  voice_audio_url TEXT,
  photo_lat       REAL,
  photo_lon       REAL,
  promoter_phone_e164 TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  sent_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dpr_messages_project ON dpr_messages(project_id, created_at DESC);

-- ── 3. DPR delivery log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dpr_delivery_log (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES dpr_messages(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,          -- whatsapp | sms | email | push
  status      TEXT NOT NULL,          -- sent | failed | queued | dry-run
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dpr_delivery_log_message ON dpr_delivery_log(message_id, created_at DESC);

-- ── 4. PO receipts (goods receipts against purchase orders) ───────────────────
CREATE TABLE IF NOT EXISTS po_receipts (
  id            TEXT PRIMARY KEY,
  po_id         TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  received_date TEXT NOT NULL DEFAULT (date('now')),
  qty           INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  unit_price    INTEGER NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  amount        INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes         TEXT,
  received_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_po_receipts_po_id ON po_receipts(po_id);

-- ── 5. Material requests (request → approved → ordered → received) ────────────
CREATE TABLE IF NOT EXISTS material_requests (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item          TEXT NOT NULL,
  unit          TEXT,
  qty           REAL NOT NULL CHECK (qty > 0),
  need_date     TEXT,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','ordered','received')),
  requested_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  po_id         TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_material_requests_project ON material_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_material_requests_po ON material_requests(po_id) WHERE po_id IS NOT NULL;

-- ── 6. Corrective actions (quality loop from failed inspections) ──────────────
CREATE TABLE IF NOT EXISTS corrective_actions (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inspection_id TEXT,                     -- inspections table not yet in D1; FK omitted
  description   TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','verified')),
  assigned_to   TEXT,
  due_date      TEXT,
  opened_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  opened_at     TEXT NOT NULL DEFAULT (datetime('now')),
  verified_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_corrective_project ON corrective_actions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_corrective_inspection ON corrective_actions(inspection_id);

-- ── 7. Shift roster (labour shift mapping) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_roster (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  labour_id   TEXT,                       -- labour_register not yet in D1; FK omitted
  worker_name TEXT,
  shift_date  TEXT NOT NULL DEFAULT (date('now')),
  shift_name  TEXT NOT NULL DEFAULT 'day' CHECK (shift_name IN ('day','night','general','special')),
  start_time  TEXT,
  end_time    TEXT,
  notes       TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shift_roster_project_date ON shift_roster(project_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_shift_roster_labour ON shift_roster(labour_id, shift_date DESC) WHERE labour_id IS NOT NULL;

-- ── 8. FF&E entries (furniture, fixtures, equipment schedule) ─────────────────
CREATE TABLE IF NOT EXISTS ffe_entries (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'furniture' CHECK (category IN ('furniture','fixture','equipment')),
  name         TEXT NOT NULL,
  space_or_room TEXT,
  manufacturer TEXT,
  model        TEXT,
  finish       TEXT,
  dimensions   TEXT,
  qty          INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_cost    INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status       TEXT NOT NULL DEFAULT 'specified' CHECK (status IN ('specified','selected','ordered','installed','cancelled')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ffe_entries_project ON ffe_entries(project_id, status);
CREATE INDEX IF NOT EXISTS idx_ffe_entries_project_code ON ffe_entries(project_id, code);

-- ── 9. Statutory approvals (NOC / government approvals register) ──────────────
CREATE TABLE IF NOT EXISTS statutory_approvals (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('fire','municipal','environment','electrical','labour','occupancy','other')),
  title       TEXT NOT NULL,
  authority   TEXT,
  ref_no      TEXT,
  applied_at  TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','applied','approved','rejected','expired')),
  decision_at TEXT,
  valid_until TEXT,
  cost        INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_statutory_project ON statutory_approvals(project_id, status);
CREATE INDEX IF NOT EXISTS idx_statutory_valid_until ON statutory_approvals(valid_until) WHERE valid_until IS NOT NULL;

-- ── 10. Procurement quotes (org-scoped vendor quote comparison) ───────────────
CREATE TABLE IF NOT EXISTS procurement_quotes (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ffe_entry_id TEXT REFERENCES ffe_entries(id) ON DELETE SET NULL,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  vendor_id   TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  item_name   TEXT,
  unit_price  INTEGER NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  lead_days   INTEGER,
  valid_until TEXT,
  status      TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','selected','rejected')),
  notes       TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_procurement_quotes_org_status ON procurement_quotes(org_id, status);
CREATE INDEX IF NOT EXISTS idx_procurement_quotes_ffe ON procurement_quotes(ffe_entry_id);

-- ── 11. Design workflow (persisted per-project design stage) ──────────────────
CREATE TABLE IF NOT EXISTS design_workflow (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_order  INTEGER NOT NULL DEFAULT 0 CHECK (stage_order BETWEEN 0 AND 6),
  review_note  TEXT,
  reviewed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TEXT,
  approved_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT design_workflow_one_per_project UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_design_workflow_project ON design_workflow(project_id);
