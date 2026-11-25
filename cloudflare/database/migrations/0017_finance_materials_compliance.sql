-- SiteTrack Pro — Cloudflare D1 Migration 0017
-- Finance (estimate, expenses, measurement_book), materials & prices,
-- compliance & permits, forecasting, labour_metrics, governance & anchors.
PRAGMA foreign_keys = ON;

-- ── 1. Estimate, Expenses, Measurement Book ───────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  total_amount  REAL NOT NULL DEFAULT 0,
  payload       TEXT NOT NULL DEFAULT '{}', -- JSON
  approved_at   TEXT,
  approved_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT DEFAULT 'draft',
  superseded_by TEXT REFERENCES estimate(id) ON DELETE SET NULL,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_estimate_project ON estimate(project_id);

CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  description  TEXT NOT NULL,
  amount       REAL NOT NULL,
  gst          REAL DEFAULT 0,
  paid_to      TEXT,
  paid_via     TEXT,
  ref_no       TEXT,
  expense_date TEXT,
  recorded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT DEFAULT 'recorded',
  attachments  TEXT, -- JSON
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id, expense_date DESC);

CREATE TABLE IF NOT EXISTS measurement_book (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mb_no       TEXT NOT NULL,
  page_no     INTEGER,
  boq_item_id TEXT,
  description TEXT NOT NULL,
  location    TEXT,
  block_id    TEXT REFERENCES blocks(id) ON DELETE SET NULL,
  floor_id    TEXT REFERENCES floors(id) ON DELETE SET NULL,
  unit        TEXT,
  length      REAL,
  breadth     REAL,
  depth       REAL,
  qty         REAL NOT NULL,
  rate        REAL,
  amount      REAL,
  measured_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  measured_at TEXT,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TEXT,
  ra_bill_id  TEXT,
  status      TEXT DEFAULT 'draft',
  notes       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mb_project ON measurement_book(project_id, mb_no);

-- ── 2. Materials & Material Prices ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  material      TEXT NOT NULL,
  quantity      TEXT,
  supplier      TEXT,
  delivery_date TEXT,
  status        TEXT DEFAULT 'ordered',
  notes         TEXT,
  logged_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id);

CREATE TABLE IF NOT EXISTS material_prices (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  material     TEXT NOT NULL,
  display_name TEXT,
  category     TEXT,
  unit         TEXT NOT NULL,
  rate         REAL NOT NULL,
  vendor_id    TEXT,
  vendor_name  TEXT,
  source       TEXT,
  effective_at TEXT NOT NULL,
  expires_at   TEXT,
  notes        TEXT,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_material_prices_org ON material_prices(org_id, material);

-- ── 3. Compliance & Permits ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  ref_no       TEXT,
  stage        TEXT,
  status       TEXT NOT NULL,
  filed_at     TEXT,
  accepted_at  TEXT,
  expires_at   TEXT,
  filed_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  payload      TEXT, -- JSON
  last_checked TEXT,
  notes        TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compliance_org ON compliance(org_id, project_id);

CREATE TABLE IF NOT EXISTS permits (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  issuing_authority TEXT,
  ref_no            TEXT,
  applied_at        TEXT,
  issued_at         TEXT,
  valid_until       TEXT,
  status            TEXT DEFAULT 'pending',
  cost              REAL,
  notes             TEXT,
  documents         TEXT, -- JSON
  applied_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_permits_project ON permits(project_id);

-- ── 4. Forecasting & Labour Metrics ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_forecast (
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  forecast_month    TEXT NOT NULL,
  projected_spend   REAL NOT NULL,
  projected_overrun REAL NOT NULL,
  confidence        REAL NOT NULL,
  computed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, forecast_month)
);

CREATE TABLE IF NOT EXISTS forecast (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  horizon_days   INTEGER,
  predicted_end  TEXT,
  predicted_cost REAL,
  overrun_amount REAL,
  risk_score     REAL,
  confidence     REAL,
  rationale      TEXT,
  lang           TEXT DEFAULT 'en',
  model          TEXT,
  inputs         TEXT, -- JSON
  generated_by   TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_forecast_project ON forecast(project_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS labour_metrics (
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_start           TEXT NOT NULL,
  attendance_rate      REAL NOT NULL,
  overtime_ratio       REAL NOT NULL,
  labour_hours         REAL NOT NULL,
  labour_cost          REAL NOT NULL,
  output_units         REAL,
  units_per_labour_day REAL,
  cost_per_unit        REAL,
  computed_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, week_start)
);

-- ── 5. Governance, Approval Chains, Delegations, Audit & BuildNow Anchors ─────
CREATE TABLE IF NOT EXISTS approval_chains (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource   TEXT NOT NULL,
  name       TEXT NOT NULL,
  rungs      TEXT NOT NULL DEFAULT '[]', -- JSON
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (org_id, resource)
);

CREATE TABLE IF NOT EXISTS delegations (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_user  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource   TEXT NOT NULL,
  start_at   TEXT NOT NULL,
  end_at     TEXT NOT NULL,
  reason     TEXT,
  active     INTEGER DEFAULT 1,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_delegations_org ON delegations(org_id, active);

CREATE TABLE IF NOT EXISTS audit_anchors (
  day            TEXT PRIMARY KEY,
  row_count      INTEGER NOT NULL,
  merkle_root    TEXT NOT NULL,
  tx_hash        TEXT,
  block_number   INTEGER,
  network        TEXT,
  status         TEXT NOT NULL,
  failure_reason TEXT,
  anchored_at    TEXT,
  confirmed_at   TEXT,
  row_id_range   TEXT, -- JSON
  metadata       TEXT  -- JSON
);

CREATE TABLE IF NOT EXISTS buildnow_anchors (
  project_id               TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sync_date                TEXT NOT NULL,
  buildnow_project_id      TEXT NOT NULL,
  approval_status          TEXT,
  current_stage            TEXT,
  expected_completion_date TEXT,
  promoter_name            TEXT,
  project_address          TEXT,
  rera_registration        TEXT,
  source                   TEXT NOT NULL,
  raw_payload              TEXT, -- JSON
  anchor_hash              TEXT NOT NULL,
  fetched_at               TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, sync_date)
);
