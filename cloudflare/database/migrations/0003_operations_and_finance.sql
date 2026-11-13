-- SiteTrack Pro — Cloudflare D1 Migration
-- File: 0003_operations_and_finance.sql
-- Description: CAD drawings, revisions, invoices, RA bills, vendors, and inventory

PRAGMA foreign_keys = ON;

-- 1. Drawings & CAD Revisions
CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  discipline TEXT NOT NULL DEFAULT 'architectural' CHECK (discipline IN ('architectural', 'structural', 'mep', 'interior', 'landscape', 'civil', 'other')),
  drawing_number TEXT NOT NULL,
  current_revision TEXT NOT NULL DEFAULT 'R0',
  current_file_key TEXT NOT NULL, -- R2 object key
  file_format TEXT NOT NULL DEFAULT 'pdf' CHECK (file_format IN ('pdf', 'dwg', 'dxf', 'png', 'jpg')),
  status TEXT DEFAULT 'for_construction' CHECK (status IN ('tender', 'preliminary', 'for_review', 'for_construction', 'as_built', 'superseded')),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, drawing_number)
);

CREATE INDEX IF NOT EXISTS idx_drawings_project ON drawings(project_id);

CREATE TABLE IF NOT EXISTS drawing_revisions (
  id TEXT PRIMARY KEY,
  drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  revision_label TEXT NOT NULL,
  file_key TEXT NOT NULL,
  change_notes TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drawing_revisions_drawing ON drawing_revisions(drawing_id);

-- 2. Vendors & Purchase Orders
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  pan TEXT,
  category TEXT DEFAULT 'materials',
  rating REAL DEFAULT 5.0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vendors_org ON vendors(org_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  po_number TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially_received', 'fulfilled', 'cancelled')),
  issued_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON purchase_orders(project_id);

-- 3. Invoices & RA Bills (Financial Invariants)
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  gst_rate REAL NOT NULL DEFAULT 18.0,
  gst_amount REAL NOT NULL DEFAULT 0,
  tds_rate REAL NOT NULL DEFAULT 0,
  tds_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('draft', 'unpaid', 'partially_paid', 'paid', 'void')),
  client_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);

-- 4. Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank' CHECK (method IN ('bank', 'cash', 'upi', 'cheque', 'razorpay', 'other')),
  reference_number TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

