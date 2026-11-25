-- SiteTrack Pro — Cloudflare D1 Migration 0012
-- Notification templates, plan payments, lifecycle emails, chat channels/messages
--
-- Translated from Supabase migrations:
--   186_notification_delivery.sql (notification_templates)
--   257_plan_payments.sql (plan_payments)
--   261_lifecycle_emails.sql (lifecycle_emails)
--   229_team_channels.sql (chat_channels, chat_messages)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - bigint -> INTEGER
--   - boolean -> INTEGER (0/1)
--   - date -> TEXT
--   - uuid[] -> TEXT (JSON array stored as text)
--   - gen_random_uuid() -> application generates UUIDs
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks, triggers
--   - cron.schedule calls omitted (D1 has no pg_cron; Workers Cron triggers used instead)
--   - auth.users -> users
--   - payments.method_check ALTER omitted (payments table already exists in D1 0003)
PRAGMA foreign_keys = ON;

-- ── 1. Notification templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id           TEXT PRIMARY KEY,
  trigger      TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  template_name TEXT,
  subject      TEXT,
  body         TEXT,
  language     TEXT NOT NULL DEFAULT 'en',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (trigger, channel, language)
);

-- ── 2. Plan payments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_payments (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL CHECK (plan IN ('basic','pro','business')),
  period       TEXT NOT NULL CHECK (period IN ('monthly','annual')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  link_id      TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled')),
  paid_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_payments_org ON plan_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_plan_payments_link ON plan_payments(link_id);

-- ── 3. Lifecycle emails ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lifecycle_emails (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_key     TEXT NOT NULL CHECK (template_key IN ('day1_welcome','day3_help_and_setup','day7_usage_stats','day10_trial_ending','day14_trial_expired','day21_miss_you','weekly_digest')),
  sent_for_date    TEXT NOT NULL,
  recipient_email  TEXT NOT NULL,
  org_name         TEXT,
  subject          TEXT,
  status           TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
  resend_message_id TEXT,
  detail           TEXT,
  sent_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, template_key, sent_for_date)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_emails_due ON lifecycle_emails(template_key, status) WHERE status = 'failed';

-- ── 4. Chat channels ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_channels (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(TRIM(name)) BETWEEN 1 AND 80),
  description TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_org ON chat_channels(org_id);

-- ── 5. Chat messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id  TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  sender_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL DEFAULT 'Member',
  body        TEXT NOT NULL CHECK (length(TRIM(body)) BETWEEN 1 AND 4000),
  mentions    TEXT DEFAULT '[]',   -- JSON array stored as text
  reply_count INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON chat_messages(parent_id, created_at);
