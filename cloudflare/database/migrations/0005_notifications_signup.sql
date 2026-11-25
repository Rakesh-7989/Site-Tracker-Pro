-- SiteTrack Pro — Cloudflare D1 Migration 0005
-- Notification delivery wiring + signup tables
--
-- Translated from Supabase migrations:
--   186_notification_delivery.sql (notification_prefs on profiles/users)
--   198_notify_delivery_wiring.sql (notify_config key/value table)
--   201_signup_attempts.sql (signup_attempts table)
--   79_signup_requests.sql (signup_requests table)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT (ISO8601)
--   - uuid -> TEXT
--   - jsonb -> TEXT (JSON stored as text string)
--   - bigint GENERATED ALWAYS AS IDENTITY -> INTEGER PRIMARY KEY AUTOINCREMENT
--   - gen_random_uuid() -> application generates UUIDs in Workers code
--   - Removed RLS policies (enforced in Workers tenant middleware)
--   - Removed GRANT/REVOKE (D1 has no SQL-level grants)
--   - Removed plpgsql trigger functions (net.http_post does not exist in D1;
--     delivery is handled by Workers code calling Resend/sms APIs directly)
--   - Removed COMMENT ON TABLE (D1 does not support comments)
--   - Removed DO $$ plpgsql blocks
PRAGMA foreign_keys = ON;

-- ── 1. notify_config (key/value delivery config) ─────────────────────────────
CREATE TABLE IF NOT EXISTS notify_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO notify_config (key, value) VALUES
  ('deliver_url', 'https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/notify-deliver')
ON CONFLICT (key) DO NOTHING;

-- ── 2. signup_attempts (append-only, abuse protection) ───────────────────────
CREATE TABLE IF NOT EXISTS signup_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip_created ON signup_attempts(ip, created_at DESC);

-- ── 3. signup_requests (approval-gated signup queue) ─────────────────────────
CREATE TABLE IF NOT EXISTS signup_requests (
  id             TEXT PRIMARY KEY,                    -- application-generated UUID
  firm_name      TEXT NOT NULL,
  contact_name   TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  plan           TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic','pro','business','custom')),
  message        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_notes   TEXT,
  reviewed_by    TEXT REFERENCES users(id),
  reviewed_at    TEXT,
  created_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON signup_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_signup_pending_email
  ON signup_requests(lower(email)) WHERE status = 'pending';

-- ── 4. notification_prefs column on users ────────────────────────────────────
-- Supabase adds this to public.profiles; D1 uses the `users` table (0001).
-- SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so this
-- is added once. Re-running this migration after the column exists will error.
ALTER TABLE users ADD COLUMN notification_prefs TEXT DEFAULT '{}';
