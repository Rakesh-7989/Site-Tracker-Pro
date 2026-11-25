-- SiteTrack Pro — Cloudflare D1 Migration 0006
-- Project financial depth + vendor performance + research library (no pgvector)
--
-- Translated from Supabase migrations:
--   179_project_financial_depth.sql (budget_changes, wip_aging, cost_forecasts + project columns)
--   178_advanced_procurement.sql (vendor_performance — po_receipts ALTER skipped; table created later)
--   180_research_library.sql (research_documents, research_collections, collection_documents — no pgvector)
--
-- Adaptations for D1:
--   - timestamptz -> TEXT
--   - uuid -> TEXT
--   - bigint -> INTEGER
--   - numeric(x,y) -> REAL
--   - jsonb/text[] -> TEXT
--   - gen_random_uuid() -> application generates UUIDs
--   - GENERATED ALWAYS AS ... STORED -> GENERATED ALWAYS AS ... STORED (SQLite supports this)
--   - pgvector (vector(384), tsvector, hnsw) -> omitted; embedding/search handled in application code
--   - Removed RLS, GRANT/REVOKE, COMMENT, DO $$ blocks
--   - ALTER TABLE projects adds financial columns (idempotency note: run once)
PRAGMA foreign_keys = ON;

-- ── 1. Projects financial columns ──────────────────────────────────────────────
-- D1 migration 0002 already creates projects with: contract_value, actual_cost,
-- committed_cost, earned_value, wip_value, cost_to_complete, forecast_final_cost,
-- budget_version. No ALTER TABLE needed here.

-- ── 2. Budget changes / reallocation log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_changes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('increase','decrease','reallocate','contingency_use')),
  category    TEXT NOT NULL, -- 'labor','material','equipment','subcontractor','overhead','contingency'
  amount      INTEGER NOT NULL CHECK (amount > 0),
  from_category TEXT,
  reason      TEXT NOT NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_budget_changes_project ON budget_changes(project_id, created_at DESC);

-- ── 3. WIP (Work in Progress) aging ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wip_aging (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category     TEXT NOT NULL, -- 'labor','material','equipment','subcontractor'
  description  TEXT,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  aging_days   INTEGER NOT NULL DEFAULT 0,
  incurred_date TEXT NOT NULL DEFAULT (date('now')),
  billed_amount INTEGER DEFAULT 0 CHECK (billed_amount >= 0),
  status       TEXT DEFAULT 'open' CHECK (status IN ('open','partially_billed','billed','write_off')),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wip_aging_project ON wip_aging(project_id, aging_days DESC);

-- ── 4. Cost-to-complete forecasting ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_forecasts (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category           TEXT NOT NULL, -- 'labor','material','equipment','subcontractor','overhead'
  original_budget    INTEGER DEFAULT 0,
  revised_budget     INTEGER DEFAULT 0,
  actual_to_date     INTEGER DEFAULT 0,
  committed          INTEGER DEFAULT 0,
  estimated_to_complete INTEGER DEFAULT 0,
  forecast_final     INTEGER DEFAULT 0,
  variance           INTEGER GENERATED ALWAYS AS (forecast_final - revised_budget) STORED,
  variance_pct       REAL GENERATED ALWAYS AS (
    CASE WHEN revised_budget > 0 THEN ROUND(((forecast_final - revised_budget) * 100.0 / revised_budget), 2) ELSE 0 END
  ) STORED,
  notes              TEXT,
  forecast_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  forecast_at        TEXT NOT NULL DEFAULT (datetime('now')),
  version            INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_cost_forecasts_project ON cost_forecasts(project_id, forecast_at DESC);

-- ── 5. Vendor performance tracking ─────────────────────────────────────────────
-- Note: po_receipts ALTER from Supabase 178 is skipped — po_receipts table
-- will be created in a later D1 migration when the receipts domain is built.
CREATE TABLE IF NOT EXISTS vendor_performance (
  id                   TEXT PRIMARY KEY,
  vendor_id            TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  org_id               TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id           TEXT REFERENCES projects(id) ON DELETE SET NULL,
  total_pos            INTEGER DEFAULT 0,
  on_time_deliveries   INTEGER DEFAULT 0,
  late_deliveries      INTEGER DEFAULT 0,
  partial_deliveries   INTEGER DEFAULT 0,
  total_qty_ordered    INTEGER DEFAULT 0,
  total_qty_delivered  INTEGER DEFAULT 0,
  total_qty_rejected   INTEGER DEFAULT 0,
  quality_issues       INTEGER DEFAULT 0,
  returns_count        INTEGER DEFAULT 0,
  dispute_count        INTEGER DEFAULT 0,
  total_amount_ordered INTEGER DEFAULT 0,
  total_amount_delivered INTEGER DEFAULT 0,
  total_amount_invoiced INTEGER DEFAULT 0,
  avg_payment_days     REAL,
  delivery_score       REAL DEFAULT 0,
  quality_score        REAL DEFAULT 0,
  financial_score      REAL DEFAULT 0,
  overall_score        REAL DEFAULT 0,
  manual_rating        REAL CHECK (manual_rating IS NULL OR (manual_rating >= 1 AND manual_rating <= 5)),
  period_start         TEXT NOT NULL,
  period_end           TEXT NOT NULL,
  computed_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vendor_id, org_id, project_id, period_start, period_end)
);

-- ── 6. Research library documents ──────────────────────────────────────────────
-- pgvector embedding_vector and tsvector search_vector omitted — D1 does not
-- support pgvector. Semantic search handled in application code.
CREATE TABLE IF NOT EXISTS research_documents (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  abstract       TEXT,
  source_type    TEXT NOT NULL CHECK (source_type IN ('is_code','astm_standard','research_paper','material_datasheet','method_statement','case_study','technical_note','regulation','other')),
  source_url     TEXT,
  document_type  TEXT NOT NULL CHECK (document_type IN ('pdf','docx','txt','md','url','other')),
  category       TEXT NOT NULL CHECK (category IN ('concrete','steel','geotech','structural','materials','sustainability','bim','safety','cost','other')),
  tags           TEXT DEFAULT '[]',   -- JSON array stored as text
  authors        TEXT DEFAULT '[]',   -- JSON array stored as text
  publication_year INTEGER,
  publisher      TEXT,
  doi            TEXT,
  isbn           TEXT,
  file_path      TEXT,
  file_size      INTEGER,
  mime_type      TEXT,
  status         TEXT DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved','archived')),
  relevance_score REAL,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_research_docs_org ON research_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_research_docs_project ON research_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_research_docs_category ON research_documents(category);
CREATE INDEX IF NOT EXISTS idx_research_docs_source_type ON research_documents(source_type);
CREATE INDEX IF NOT EXISTS idx_research_docs_status ON research_documents(status);

-- ── 7. Research collections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_collections (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  is_public    INTEGER DEFAULT 0,
  cover_image_path TEXT,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_research_collections_org ON research_collections(org_id);

-- ── 8. Collection documents (many-to-many) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_documents (
  collection_id TEXT NOT NULL REFERENCES research_collections(id) ON DELETE CASCADE,
  document_id   TEXT NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  added_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  notes         TEXT,
  sort_order    INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_docs_collection ON collection_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_docs_document ON collection_documents(document_id);
