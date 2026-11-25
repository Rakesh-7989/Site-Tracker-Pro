-- SiteTrack Pro — Cloudflare D1 Migration 0018
-- Project messages, chat channel members/reads/reactions, notification rules,
-- and promoter digest subscriptions/dispatches.
PRAGMA foreign_keys = ON;

-- ── 1. Project Messages (Legacy & Thread Chat) ────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  thread_id   TEXT,
  sender_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT,
  body        TEXT NOT NULL,
  attachments TEXT, -- JSON
  read_by     TEXT, -- JSON
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at DESC);

-- ── 2. Chat Channel Members, Reads, Reactions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_channel_members (
  channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel_id, profile_id)
);

CREATE TABLE IF NOT EXISTS chat_channel_reads (
  channel_id   TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- ── 3. Notification Rules & Digest Subscriptions/Dispatches ───────────────────
CREATE TABLE IF NOT EXISTS notification_rules (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger       TEXT NOT NULL,
  channel       TEXT NOT NULL,
  recipients    TEXT NOT NULL DEFAULT '[]', -- JSON array
  enabled       INTEGER DEFAULT 1,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  template_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_rules_org ON notification_rules(org_id);

CREATE TABLE IF NOT EXISTS digest_subscriptions (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          TEXT REFERENCES projects(id) ON DELETE CASCADE,
  promoter_phone_e164 TEXT NOT NULL,
  promoter_name       TEXT,
  language            TEXT NOT NULL DEFAULT 'en',
  timezone            TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  hour_local          INTEGER NOT NULL DEFAULT 7,
  status              TEXT NOT NULL DEFAULT 'active',
  paused_until        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  promoter_email      TEXT
);
CREATE INDEX IF NOT EXISTS idx_digest_subs_org ON digest_subscriptions(org_id, status);

CREATE TABLE IF NOT EXISTS digest_dispatches (
  id               TEXT PRIMARY KEY,
  subscription_id  TEXT NOT NULL REFERENCES digest_subscriptions(id) ON DELETE CASCADE,
  sent_for_date    TEXT NOT NULL,
  dispatched_at    TEXT NOT NULL DEFAULT (datetime('now')),
  outcome          TEXT NOT NULL,
  meta_message_id  TEXT,
  failure_reason   TEXT,
  rendered_payload TEXT -- JSON
);
CREATE INDEX IF NOT EXISTS idx_digest_dispatches_sub ON digest_dispatches(subscription_id, sent_for_date DESC);
