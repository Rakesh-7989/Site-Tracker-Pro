-- SiteTrack Pro — Cloudflare D1 Migration 0010
-- Inventory ledger, BOQ items, Resend delivery events
--
-- Translated from Supabase migrations:
--   01_schema.sql (inventory_transactions, boq_items)
--   201_resend_delivery_events.sql (resend_delivery_events)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - numeric(14,3) -> REAL
--   - date -> TEXT
--   - jsonb -> TEXT
--   - gen_random_uuid() -> application generates UUIDs
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks
--   - auth.users/profiles -> users
PRAGMA foreign_keys = ON;

-- ── 1. Inventory transactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  txn_date    TEXT NOT NULL DEFAULT (date('now')),
  material    TEXT NOT NULL,
  unit        TEXT,
  qty         REAL NOT NULL CHECK (qty > 0),
  direction   TEXT NOT NULL CHECK (direction IN ('inward','outward','return','wastage')),
  source      TEXT,
  ref_no      TEXT,
  po_id       TEXT,
  recorded_by TEXT REFERENCES users(id),
  notes       TEXT,
  attachments TEXT DEFAULT '[]', -- JSON array stored as text
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_project_material ON inventory_transactions(project_id, material);

-- ── 2. BOQ items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_items (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code   TEXT,
  item_name   TEXT NOT NULL,
  unit        TEXT,
  qty         REAL NOT NULL DEFAULT 0,
  rate        REAL NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','ordered','received')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_boq_items_project ON boq_items(project_id);

-- ── 3. Resend delivery events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resend_delivery_events (
  id         TEXT PRIMARY KEY,
  event      TEXT NOT NULL CHECK (event IN ('sent','delivered','delivery_delayed','complained','bounced','opened','clicked')),
  raw_event  TEXT NOT NULL,
  message_id TEXT,
  to_email   TEXT,
  subject    TEXT,
  tags       TEXT DEFAULT '[]', -- JSON array stored as text
  payload    TEXT NOT NULL,     -- JSON stored as text
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resend_delivery_events_event ON resend_delivery_events(event);
CREATE INDEX IF NOT EXISTS idx_resend_delivery_events_message ON resend_delivery_events(message_id);
CREATE INDEX IF NOT EXISTS idx_resend_delivery_events_to ON resend_delivery_events(to_email);
CREATE INDEX IF NOT EXISTS idx_resend_delivery_events_received ON resend_delivery_events(received_at DESC);
