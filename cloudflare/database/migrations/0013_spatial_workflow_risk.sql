-- SiteTrack Pro — Cloudflare D1 Migration 0013
-- Spatial hierarchy, workflow engine, event outbox, risk signals,
-- org invitations, staff hierarchy
--
-- Translated from Supabase migrations:
--   206_spatial_hierarchy.sql (sites, buildings, floors, zones, rooms, user_project_locations)
--   207_workflow_engine.sql (workflow_definitions, workflow_instances, workflow_transitions)
--   208_event_outbox.sql (event_outbox)
--   225_risk_signals_cron.sql (project_risk_signals)
--   37_org_invitations.sql (org_invitations)
--   99_staff_hierarchy.sql (staff_tier on users/profiles)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - numeric(x,y) -> REAL
--   - date -> TEXT
--   - PostGIS geography -> omitted (D1 has no PostGIS; coordinates stored as TEXT lat/lng)
--   - PostGIS extension -> omitted
--   - gen_random_uuid() -> application generates UUIDs
--   - jsonb -> TEXT
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks, triggers
--   - Removed pg_cron.schedule calls (D1 has no pg_cron; Workers Cron triggers used instead)
--   - Removed organizations.enabled_modules CHECK ALTER (check constraint managed separately)
--   - auth.users/profiles -> users
--   - organizations.created_by_staff column added via ALTER TABLE (run once)
PRAGMA foreign_keys = ON;

-- ── 1. Sites ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,
  address      TEXT,
  lat          REAL,
  lng          REAL,
  area_sqft    REAL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','planned','decommissioned')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sites_project ON sites(project_id);
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(organization_id);

-- ── 2. Buildings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buildings (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT,
  floors_total    INTEGER NOT NULL DEFAULT 0 CHECK (floors_total >= 0),
  building_type   TEXT CHECK (building_type IN ('standard','high-rise','low-rise','temporary','modular')),
  address         TEXT,
  year_built      INTEGER,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_buildings_site ON buildings(site_id);

-- ── 3. Spatial floors ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spatial_floors (
  id           TEXT PRIMARY KEY,
  building_id  TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  floor_number INTEGER NOT NULL,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spatial_floors_building ON spatial_floors(building_id);

-- ── 4. Zones ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zones (
  id          TEXT PRIMARY KEY,
  floor_id    TEXT NOT NULL REFERENCES spatial_floors(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  zone_type   TEXT CHECK (zone_type IN ('construction','architecture','interior')),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_zones_floor ON zones(floor_id);

-- ── 5. Rooms ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  zone_id    TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  room_code  TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rooms_zone ON rooms(zone_id);

-- ── 6. User project locations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_project_locations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  location_id  TEXT,  -- generic ref to sites/buildings/floors/zones/rooms
  location_type TEXT CHECK (location_type IN ('site','building','floor','zone','room')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_project_locations_user ON user_project_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_project_locations_project ON user_project_locations(project_id);

-- ── 7. Workflow definitions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  initial_state  TEXT NOT NULL,
  states         TEXT DEFAULT '[]',   -- JSON array stored as text
  transitions    TEXT DEFAULT '[]',   -- JSON array stored as text
  enabled        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 8. Workflow instances ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_instances (
  id               TEXT PRIMARY KEY,
  workflow_id      TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE RESTRICT,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  current_state    TEXT NOT NULL,
  project_id       TEXT REFERENCES projects(id) ON DELETE CASCADE,
  organization_id  TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workflow_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_project ON workflow_instances(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_org ON workflow_instances(organization_id);

-- ── 9. Workflow transitions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id               TEXT PRIMARY KEY,
  instance_id      TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  from_state       TEXT NOT NULL,
  to_state         TEXT NOT NULL,
  transitioned_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_instance ON workflow_transitions(instance_id, created_at);

-- ── 10. Event outbox ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_outbox (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  org_id      TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id   TEXT,
  payload     TEXT NOT NULL DEFAULT '{}',  -- JSON stored as text
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_status ON event_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_event_outbox_org ON event_outbox(org_id);

-- ── 11. Project risk signals ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_risk_signals (
  project_id        TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  risk_score        INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level        TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  delay_probability REAL NOT NULL DEFAULT 0 CHECK (delay_probability >= 0 AND delay_probability <= 0.9),
  delay_days        INTEGER NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  burn_accelerating INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 12. Org invitations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_invitations (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL,
  invited_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  token        TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','cancelled')),
  expires_at   TEXT NOT NULL DEFAULT (datetime('now','+48 hours')),
  accepted_at  TEXT,
  accepted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_status ON org_invitations(org_id, status);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email_pending ON org_invitations(LOWER(email)) WHERE status = 'pending';

-- ── 13. Staff hierarchy (staff_tier on users) ─────────────────────────────────
-- created_by_staff already exists on organizations (added in migration 0001).
ALTER TABLE users ADD COLUMN staff_tier TEXT CHECK (staff_tier IN ('owner','head','member'));
ALTER TABLE users ADD COLUMN staff_manager_id TEXT REFERENCES users(id) ON DELETE SET NULL;
