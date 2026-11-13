-- SiteTrack Pro — Cloudflare D1 Migration
-- File: 0001_control_plane.sql
-- Description: Control plane schema (users, organizations, roles, subscriptions, audit)

PRAGMA foreign_keys = ON;

-- 1. Users / Profiles
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_platform_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'basic',
  org_type TEXT CHECK (org_type IN ('developer', 'builder', 'architecture_firm', 'interior_firm', 'contractor', 'consultant', 'pmc', 'vendor')),
  segments TEXT DEFAULT '[]', -- JSON array of segments
  enabled_modules TEXT DEFAULT '[]', -- JSON array of enabled modules
  contact_email TEXT,
  billing_period TEXT DEFAULT 'monthly',
  subdomain TEXT UNIQUE,
  created_by_staff TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- 3. Organization Memberships
CREATE TABLE IF NOT EXISTS org_members (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_admin INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_by TEXT REFERENCES users(id),
  invited_at TEXT,
  accepted_at TEXT,
  joined_at TEXT DEFAULT (datetime('now')),
  removed_at TEXT,
  PRIMARY KEY (org_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_profile ON org_members(profile_id);

-- 4. Subscriptions & Billing
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  provider TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay', 'manual')),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  billing_period TEXT DEFAULT 'monthly',
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);

-- 5. Immutable Audit Log v2
CREATE TABLE IF NOT EXISTS audit_log_v2 (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),
  project_id TEXT,
  actor_id TEXT REFERENCES users(id),
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  before TEXT, -- JSON snapshot
  after TEXT,  -- JSON snapshot
  message TEXT,
  ts TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_ts ON audit_log_v2(org_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log_v2(project_id, ts DESC);

