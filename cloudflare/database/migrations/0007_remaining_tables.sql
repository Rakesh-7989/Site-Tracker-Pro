-- SiteTrack Pro — Cloudflare D1 Migration 0007
-- Remaining tables: payment events, external inspectors, sub-contractors,
-- WhatsApp quota, project access requests, org custom roles, RBAC capability
-- overrides, resource ACL + client/vendor scopes, vendor profile + PO payment
-- columns.
--
-- Translated from Supabase migrations:
--   175_payment_timeline.sql (payment_events)
--   62_external_inspectors.sql (external_inspectors)
--   64_sub_contractors.sql (sub_contractors)
--   57_whatsapp_quota_counter.sql (whatsapp_quota_counter)
--   131_project_access_requests.sql (project_access_requests)
--   70_org_custom_roles.sql (org_roles, org_role_capabilities, org_member_roles)
--   69_role_capability_overrides.sql (role_capability_overrides)
--   204_rbac_v2_resource_acl.sql (resource_acl_entries, client_portal_permissions, vendor_project_scopes)
--   174_vendor_profile_payment.sql (profile_id on vendors; payment columns on purchase_orders)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - bigint -> INTEGER
--   - numeric(x,y) -> REAL
--   - gen_random_uuid() -> application generates UUIDs
--   - date -> TEXT (ISO date string)
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks, plpgsql functions
--   - Removed pg_constraint DROP/ADD patterns (D1 handles CHECK inline)
--   - ALTER TABLE vendors/purchase_orders adds columns (run once; SQLite lacks IF NOT EXISTS for columns)
PRAGMA foreign_keys = ON;

-- ── 1. Vendors: add profile_id (links vendor to auth user) ─────────────────────
ALTER TABLE vendors ADD COLUMN profile_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vendors_profile_idx ON vendors(profile_id) WHERE profile_id IS NOT NULL;

-- ── 2. Purchase orders: add payment tracking columns ───────────────────────────
ALTER TABLE purchase_orders ADD COLUMN invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid','overdue'));
CREATE INDEX IF NOT EXISTS purchase_orders_invoice_idx ON purchase_orders(invoice_id) WHERE invoice_id IS NOT NULL;

-- ── 3. Payment events (chronological payment + status log) ─────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('invoice','ra_bill')),
  target_id    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('payment_received','status_changed','payment_method_updated','reference_updated')),
  description  TEXT NOT NULL,
  amount       REAL,
  method       TEXT,
  reference    TEXT,
  old_status   TEXT,
  new_status   TEXT,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_events_target ON payment_events(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_project ON payment_events(project_id, created_at DESC);

-- ── 4. External inspectors (RERA/municipal/lender auditors) ────────────────────
CREATE TABLE IF NOT EXISTS external_inspectors (
  profile_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  authority      TEXT NOT NULL CHECK (authority IN ('rera-tg','rera-ka','rera-mh','municipal','bank-lender','fire-noc','environmental','other')),
  authority_ref  TEXT,
  valid_from     TEXT NOT NULL DEFAULT (date('now')),
  valid_until    TEXT,
  added_by       TEXT REFERENCES users(id),
  added_at       TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at     TEXT,
  PRIMARY KEY (profile_id, org_id, authority)
);

CREATE INDEX IF NOT EXISTS external_inspectors_org_idx ON external_inspectors(org_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS external_inspectors_profile_idx ON external_inspectors(profile_id) WHERE revoked_at IS NULL;

-- ── 5. Sub-contractor hierarchy ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_contractors (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub_profile_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade           TEXT NOT NULL CHECK (trade IN ('masonry','rcc','electrical','plumbing','painting','tiling','carpentry','fabrication','waterproofing','hvac','glazing','flooring','landscaping','excavation','other')),
  scope_of_work   TEXT,
  contract_value_inr INTEGER,
  added_by        TEXT REFERENCES users(id),
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at      TEXT,
  UNIQUE (project_id, parent_profile_id, sub_profile_id, trade)
);

CREATE INDEX IF NOT EXISTS sub_contractors_project_idx ON sub_contractors(project_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS sub_contractors_parent_idx ON sub_contractors(parent_profile_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS sub_contractors_sub_idx ON sub_contractors(sub_profile_id) WHERE removed_at IS NULL;

-- ── 6. WhatsApp quota counter (free-tier guard) ────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_quota_counter (
  waba_id       TEXT NOT NULL,
  utc_month     TEXT NOT NULL,   -- 'YYYY-MM'
  sent_count    INTEGER NOT NULL DEFAULT 0,
  soft_limit    INTEGER NOT NULL DEFAULT 800,
  hard_limit    INTEGER NOT NULL DEFAULT 1000,
  last_increment TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (waba_id, utc_month),
  CHECK (sent_count >= 0)
);

-- ── 7. Project access requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_access_requests (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by    TEXT REFERENCES users(id),
  reviewed_at    TEXT,
  UNIQUE (project_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON project_access_requests(status, created_at DESC);

-- ── 8. Org custom roles (HRMS pattern) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_roles (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  based_on    TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, key)
);

CREATE INDEX IF NOT EXISTS org_roles_org_idx ON org_roles(org_id);

CREATE TABLE IF NOT EXISTS org_role_capabilities (
  org_role_id TEXT NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
  capability  TEXT NOT NULL,
  PRIMARY KEY (org_role_id, capability)
);

CREATE TABLE IF NOT EXISTS org_member_roles (
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_role_id TEXT NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at  TEXT,
  PRIMARY KEY (org_id, profile_id, org_role_id)
);

-- ── 9. Role capability overrides (superadmin-managed grants/revokes) ───────────
CREATE TABLE IF NOT EXISTS role_capability_overrides (
  id          TEXT PRIMARY KEY,
  org_id      TEXT REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global
  role        TEXT NOT NULL,
  capability  TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('grant','revoke')),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS role_capability_overrides_uniq
  ON role_capability_overrides(COALESCE(org_id,''), role, capability);

CREATE INDEX IF NOT EXISTS role_capability_overrides_lookup
  ON role_capability_overrides(role, capability);

-- ── 10. RBAC V2 resource ACL ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resource_acl_entries (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('user','org_tier','identity_role')),
  subject_id    TEXT NOT NULL,
  capability    TEXT NOT NULL REFERENCES rbac_capabilities(id) ON DELETE CASCADE,
  effect        TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  note          TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_acl_entries_uniq
  ON resource_acl_entries(org_id, resource_type, resource_id, subject_type, subject_id, capability);
CREATE INDEX IF NOT EXISTS resource_acl_entries_lookup
  ON resource_acl_entries(resource_type, resource_id, subject_type, subject_id);

-- ── 11. Client portal permissions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_portal_permissions (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  client_email  TEXT NOT NULL,
  capability    TEXT NOT NULL REFERENCES rbac_capabilities(id) ON DELETE CASCADE,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS client_portal_permissions_org_idx ON client_portal_permissions(org_id);
CREATE INDEX IF NOT EXISTS client_portal_permissions_email_idx ON client_portal_permissions(client_email);

-- ── 12. Vendor project scopes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_project_scopes (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id   TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capability  TEXT NOT NULL,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS vendor_project_scopes_vendor_idx ON vendor_project_scopes(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_project_scopes_project_idx ON vendor_project_scopes(project_id);
