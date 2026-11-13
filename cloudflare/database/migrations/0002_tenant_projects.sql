-- SiteTrack Pro — Cloudflare D1 Migration
-- File: 0002_tenant_projects.sql
-- Description: Tenant projects, partner collaboration, milestones, tasks, and updates

PRAGMA foreign_keys = ON;

-- 1. Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'construction',
  description TEXT,
  location TEXT,
  lat REAL,
  lng REAL,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'on_hold', 'completed', 'archived')),
  progress REAL DEFAULT 0,
  budget REAL DEFAULT 0,
  contract_value REAL,
  actual_cost REAL DEFAULT 0,
  committed_cost REAL DEFAULT 0,
  earned_value REAL DEFAULT 0,
  wip_value REAL DEFAULT 0,
  cost_to_complete REAL DEFAULT 0,
  forecast_final_cost REAL DEFAULT 0,
  start_date TEXT,
  expected_end_date TEXT,
  client_name TEXT,
  client_email TEXT,
  architect_id TEXT REFERENCES users(id),
  archived_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- 2. Project Members
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  assigned_at TEXT DEFAULT (datetime('now')),
  assigned_by TEXT REFERENCES users(id),
  removed_at TEXT,
  PRIMARY KEY (project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_profile ON project_members(profile_id);

-- 3. Cross-Org Partner Organizations (The Moat)
CREATE TABLE IF NOT EXISTS project_partner_orgs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('viewer', 'contributor', 'manager')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  invite_code TEXT UNIQUE,
  org_name_snapshot TEXT,
  invited_by TEXT REFERENCES users(id),
  invited_at TEXT DEFAULT (datetime('now')),
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_partner_orgs_project ON project_partner_orgs(project_id);
CREATE INDEX IF NOT EXISTS idx_partner_orgs_org ON project_partner_orgs(org_id);

-- 4. Cross-Org Partner Members
CREATE TABLE IF NOT EXISTS project_partner_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'partner_viewer',
  added_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, org_id, profile_id)
);

-- 5. Milestones & Tasks
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  weight REAL DEFAULT 1.0,
  order_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  due_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

-- 6. Site Updates & Daily Reports
CREATE TABLE IF NOT EXISTS site_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  photos TEXT DEFAULT '[]', -- JSON array of R2 photo keys
  weather TEXT,
  labour_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_site_updates_project_ts ON site_updates(project_id, created_at DESC);

