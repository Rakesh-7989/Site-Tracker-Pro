-- SiteTrack Pro — Cloudflare D1 Migration 0004
-- RBAC V2 substrate: capabilities catalog + role profiles + bindings + org mode + authorization audit
--
-- Translated from Supabase migration 203_rbac_v2_catalog.sql for D1 (SQLite).
-- Adaptations for D1:
--   - timestamptz -> TEXT (ISO8601 strings)
--   - uuid -> TEXT
--   - gen_random_uuid() -> application generates UUIDs in Workers code
--   - Removed RLS policies (enforced in Workers tenant middleware)
--   - Removed GRANT/REVOKE (D1 has no SQL-level grants)
--   - Removed COMMENT ON TABLE (D1 does not support comments)
--   - Removed DO $$ plpgsql blocks (D1 does not support plpgsql)
--   - Seeding data must be inserted via application code or separate seed script
PRAGMA foreign_keys = ON;

-- ── 1. Capability catalog ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_capabilities (
  id          TEXT PRIMARY KEY,            -- capability id (domain:action)
  domain      TEXT NOT NULL,               -- first segment (project, finance, …)
  label       TEXT NOT NULL,               -- display label (defaults to id)
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,  -- 1 = true, 0 = false
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_capabilities_id_uniq ON rbac_capabilities(id);

-- ── 2. Role profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_role_profiles (
  id            TEXT PRIMARY KEY,          -- application-generated UUID
  code          TEXT NOT NULL,             -- stable slug (arch_principal, …)
  name          TEXT NOT NULL,
  description   TEXT,
  segment       TEXT CHECK (segment IS NULL OR segment IN ('construction','architecture','interior','consultancy','multiple')),
  scope         TEXT NOT NULL DEFAULT 'org' CHECK (scope IN ('org','project')),
  source_role   TEXT,                      -- system profiles reference an identity role
  is_system     INTEGER NOT NULL DEFAULT 0,-- 1 = true, 0 = false
  org_id        TEXT REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = platform/system profile
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_role_profiles_code_uniq ON rbac_role_profiles(code);
CREATE INDEX IF NOT EXISTS rbac_role_profiles_org_idx ON rbac_role_profiles(org_id);

-- ── 3. Profile bindings (explicit allow/deny deltas) ─────────────────────────
CREATE TABLE IF NOT EXISTS rbac_profile_bindings (
  id          TEXT PRIMARY KEY,          -- application-generated UUID
  profile_id  TEXT NOT NULL REFERENCES rbac_role_profiles(id) ON DELETE CASCADE,
  capability  TEXT NOT NULL REFERENCES rbac_capabilities(id) ON DELETE CASCADE,
  effect      TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  note        TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_profile_bindings_uniq ON rbac_profile_bindings(profile_id, capability);

-- ── 4. Org V2 mode ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_rbac_settings (
  org_id      TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL DEFAULT 'matrix' CHECK (mode IN ('matrix','shadow','enforce')),
  updated_by  TEXT REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 5. Authorization audit ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authorization_audit (
  id            TEXT PRIMARY KEY,          -- application-generated UUID
  actor_id      TEXT,                      -- user id performing the check
  org_id        TEXT,
  project_id    TEXT,
  resource_type TEXT,                      -- org | project | document | drawing | …
  resource_id   TEXT,
  capability    TEXT NOT NULL,
  effect        TEXT NOT NULL,             -- allow | deny
  mode          TEXT NOT NULL DEFAULT 'matrix',  -- matrix | shadow | enforce
  reason        TEXT,                      -- matrix | override | profile | deny | acl | superadmin
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS authorization_audit_actor_idx ON authorization_audit(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS authorization_audit_org_idx   ON authorization_audit(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS authorization_audit_cap_idx   ON authorization_audit(capability, created_at DESC);

-- ── Seed data note ─────────────────────────────────────────────────────────────
-- System profiles and delta bindings (from Supabase DO $$ block) are NOT
-- seeded here because D1 does not support plpgsql DO blocks.
-- They must be inserted via application code (Workers seed script) or the
-- verify-d1-schema harness. See docs/cloudflare-migration/CONVERSION_PLAN.md.
