-- SiteTrack Pro — Cloudflare D1 Migration 0015
-- Extended control plane, platform flags, billing history, profiles, branding,
-- share tokens, templates, staff invites, and usage metrics.
PRAGMA foreign_keys = ON;

-- ── 1. Profiles ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  avatar               TEXT,
  role                 TEXT NOT NULL DEFAULT 'engineer',
  created_at           TEXT DEFAULT (datetime('now')),
  is_staff             INTEGER NOT NULL DEFAULT 0,
  staff_tier           TEXT,
  staff_manager_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  phone                TEXT,
  company              TEXT,
  job_title            TEXT,
  city                 TEXT,
  pref_language        TEXT DEFAULT 'en',
  profile_completed    INTEGER NOT NULL DEFAULT 0,
  consent_version      TEXT,
  consent_updated_at   TEXT,
  notification_prefs   TEXT, -- JSON
  must_change_password INTEGER NOT NULL DEFAULT 0,
  push_endpoint        TEXT,
  push_keys            TEXT  -- JSON
);

-- ── 2. Plans ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  tagline             TEXT,
  monthly_inr         INTEGER NOT NULL DEFAULT 0,
  yearly_inr          INTEGER,
  feature_caps        TEXT NOT NULL DEFAULT '{}', -- JSON
  features_md         TEXT,
  recommended         INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'active',
  display_order       INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  requires_superadmin INTEGER NOT NULL DEFAULT 0
);

-- ── 3. Billing History ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_history (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay', 'manual', 'credit_note')),
  external_id     TEXT,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount          REAL NOT NULL,
  currency        TEXT DEFAULT 'INR',
  gst             REAL DEFAULT 0,
  status          TEXT NOT NULL,
  failure_reason  TEXT,
  paid_at         TEXT,
  invoice_url     TEXT,
  receipt_no      TEXT,
  payload         TEXT, -- JSON
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_history_org ON billing_history(org_id, created_at DESC);

-- ── 4. Org Feature Flags & Integrations & Ops Toggles ─────────────────────────
CREATE TABLE IF NOT EXISTS org_feature_flags (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, key)
);

CREATE TABLE IF NOT EXISTS org_integrations (
  org_id     TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  ai         TEXT, -- JSON
  razorpay   TEXT, -- JSON
  whatsapp   TEXT, -- JSON (legacy nullable)
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ops_toggles (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '{}', -- JSON
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, key)
);

-- ── 5. Platform Feature Flags, Staff Invites, Staff Only Features ─────────────
CREATE TABLE IF NOT EXISTS platform_feature_flags (
  key        TEXT PRIMARY KEY,
  enabled    INTEGER DEFAULT 0,
  rollout    INTEGER DEFAULT 100,
  note       TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_invites (
  id         TEXT PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE,
  email      TEXT,
  tier       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at    TEXT,
  revoked_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_only_features (
  view_id                TEXT PRIMARY KEY,
  reason                 TEXT NOT NULL,
  frozen_at              TEXT NOT NULL DEFAULT (datetime('now')),
  frozen_in_migration    TEXT NOT NULL,
  un_frozen_at           TEXT,
  un_frozen_in_migration TEXT,
  un_frozen_reason       TEXT
);

-- ── 6. Usage Metrics, Branding, Share Tokens, Templates ───────────────────────
CREATE TABLE IF NOT EXISTS usage_metrics (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  metric     TEXT NOT NULL,
  value      REAL NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, day, metric)
);

CREATE TABLE IF NOT EXISTS branding (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  logo_url    TEXT,
  tagline     TEXT,
  accent      TEXT,
  theme       TEXT,
  letterhead  TEXT,
  footer_text TEXT,
  pdf_header  TEXT, -- JSON
  pdf_footer  TEXT, -- JSON
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_branding_org ON branding(org_id);

CREATE TABLE IF NOT EXISTS share_tokens (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL,
  target_kind    TEXT,
  target_id      TEXT,
  token          TEXT NOT NULL UNIQUE,
  password_hash  TEXT,
  expires_at     TEXT,
  max_views      INTEGER,
  view_count     INTEGER DEFAULT 0,
  last_viewed_at TEXT,
  revoked_at     TEXT,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_org ON share_tokens(org_id);

CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  payload     TEXT, -- JSON
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_org_kind ON templates(org_id, kind);
