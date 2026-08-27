-- SiteTrack Pro — Supabase schema (Phase B1)
-- Source of truth: docs/archive/BACKEND_PLAN.md
--
-- Run order: 01_schema.sql -> 02_rls.sql -> 03_storage.sql -> 04_triggers.sql
--
-- Tech Lead approval required before running on any production project.
-- Run on a dev Supabase project first; verify with 02_rls.sql tests.

-- ============================================================================
-- IDENTITY
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar text,
  -- superadmin sits OUTSIDE the org boundary and can access every row.
  -- Only assign superadmin via direct SQL on the dev project, never via UI.
  role text not null check (role in ('superadmin','architect','pm','contractor','client')),
  created_at timestamptz default now()
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  plan text default 'basic' check (plan in ('basic','pro','business','custom')),
  created_at timestamptz default now()
);

create table if not exists org_members (
  org_id uuid references organizations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text not null check (role in ('architect','pm','contractor','client','admin')),
  joined_at timestamptz default now(),
  primary key (org_id, profile_id)
);

-- ============================================================================
-- PROJECTS
-- ============================================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  architect_id uuid references profiles(id),
  name text not null,
  description text,
  location text,
  lat numeric(9,6),
  lng numeric(9,6),
  status text default 'active' check (status in ('active','completed','on_hold','cancelled')),
  progress smallint default 0 check (progress between 0 and 100),
  budget bigint default 0,
  start_date date,
  expected_end_date date,
  client_name text,
  client_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_projects_org on projects(org_id);
create index if not exists idx_projects_client_email on projects(client_email);

create table if not exists project_members (
  project_id uuid references projects(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  project_role text not null check (project_role in ('architect','pm','contractor','client')),
  added_at timestamptz default now(),
  primary key (project_id, profile_id)
);

-- ============================================================================
-- WORK
-- ============================================================================

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  status text default 'pending' check (status in ('pending','in_progress','completed')),
  due_date date,
  completed_date date,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete set null,
  title text not null,
  assignee_name text,
  due_date date,
  priority text default 'medium' check (priority in ('high','medium','low')),
  status text default 'pending' check (status in ('pending','in_progress','completed')),
  created_at timestamptz default now()
);

create table if not exists site_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  author_id uuid references profiles(id),
  notes text not null,
  weather text,
  workers_count smallint,
  update_date date default current_date,
  created_at timestamptz default now()
);

create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text,
  severity text default 'medium' check (severity in ('high','medium','low')),
  status text default 'open' check (status in ('open','resolved')),
  reported_by uuid references profiles(id),
  reported_date date default current_date,
  resolved_by uuid references profiles(id),
  resolved_date date
);

-- ============================================================================
-- DRAWINGS (with revision governance — mirrors App.jsx auto-supersede)
-- ============================================================================

create table if not exists drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  type text not null,
  revision text default 'Rev A',
  notes text,
  status text default 'current' check (status in ('current','superseded')),
  superseded_by uuid references drawings(id),
  released_to text[] default '{}',  -- subset of {'pm','contractor','client'}
  released_by uuid references profiles(id),
  release_date date default current_date,
  storage_path text,                 -- supabase storage key
  created_at timestamptz default now(),
  -- Enforce one current per (project, title, type)
  constraint unique_current_drawing_per_title
    exclude using btree (project_id with =, lower(trim(title)) with =, lower(trim(type)) with =)
    where (status = 'current')
);

create index if not exists idx_drawings_project on drawings(project_id);

-- ============================================================================
-- MATERIALS + INVENTORY LEDGER (matches src/App.jsx INIT_LEDGER schema)
-- ============================================================================

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  material text not null,
  quantity text,
  supplier text,
  delivery_date date,
  status text default 'expected' check (status in ('expected','received','rejected')),
  notes text,
  logged_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  txn_date date default current_date,
  material text not null,
  unit text,
  qty numeric(14,3) not null check (qty > 0),
  direction text not null check (direction in ('inward','outward','return','wastage')),
  source text,
  ref_no text,
  po_id uuid,                        -- FK added in 04_triggers.sql to break cycle
  recorded_by uuid references profiles(id),
  notes text,
  attachments jsonb default '[]',
  created_at timestamptz default now()
);

create index if not exists idx_inventory_project_material on inventory_transactions(project_id, material);

-- ============================================================================
-- BOQ (matches src/App.jsx INIT_BOQ schema)
-- ============================================================================

create table if not exists boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  code text,
  description text not null,
  unit text,
  qty numeric(14,3) check (qty > 0),
  rate numeric(14,2) check (rate >= 0),
  amount numeric(16,2) generated always as (qty * rate) stored,
  category text default 'Other' check (category in ('Civil','MEP','Finishing','External','Other')),
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_boq_project on boq_items(project_id);

-- ============================================================================
-- PROCUREMENT
-- ============================================================================

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,
  contact text,
  phone text,
  gst text,                          -- GSTIN
  rating numeric(2,1) check (rating between 0 and 5),
  created_at timestamptz default now()
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  vendor_id uuid references vendors(id),
  po_no text not null,
  items text,
  amount bigint not null,
  gst numeric(4,2) default 18,
  status text default 'pending' check (status in ('pending','approved','delivered','cancelled')),
  created_date date default current_date,
  delivery_date date
);

-- Now we can add the FK from inventory_transactions.po_id
do $$ begin
  alter table inventory_transactions
    add constraint fk_inventory_po foreign key (po_id) references purchase_orders(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- BILLING
-- ============================================================================

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  milestone_id uuid references milestones(id),
  no text not null,
  amount bigint not null,
  gst numeric(4,2) default 18,
  tds numeric(4,2) default 2,
  status text default 'sent' check (status in ('sent','paid','overdue','cancelled')),
  issued_date date,
  paid_date date
);

create table if not exists ra_bills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  no text not null,
  subcontractor text,
  scope text,
  bill_amount bigint not null,
  cumulative bigint,
  retention_pct numeric(4,2) default 5,
  paid_amount bigint default 0,
  status text default 'submitted' check (status in ('submitted','approved','paid','rejected')),
  bill_date date default current_date
);

-- ============================================================================
-- LABOUR (statutory register)
-- ============================================================================

create table if not exists labour_register (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  aadhaar text,                      -- masked in UI; never returned raw via REST
  epf text,
  esi text,
  trade text,
  wage numeric(8,2),
  joined date
);

-- ============================================================================
-- AUDIT LOG (append-only — write policy revoked, inserts via trigger only)
-- ============================================================================

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  type text,
  action text,
  detail text,
  by_profile_id uuid references profiles(id),
  by_name text,
  by_role text,
  created_at timestamptz default now()
);

create index if not exists idx_activity_project_time on activity_log(project_id, created_at desc);

-- ============================================================================
-- ATTACHMENTS (polymorphic — covers drawings, invoices, RFI, messages, photos)
-- ============================================================================

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'site_update','issue','drawing','message','invoice','rfi','co','submittal','permit',
    'po','ra_bill','inspection','safety','worklog','checklist','equipment','diary','boq','ledger'
  )),
  entity_id uuid not null,
  storage_path text not null,        -- supabase storage key
  original_name text,
  size bigint,
  mime text,
  kind text check (kind in ('image','pdf','cad','doc','sheet','archive','file')),
  geo jsonb,                          -- { lat, lng, captured_at } — for photo metadata
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now()
);

create index if not exists idx_attachments_entity on attachments(entity_type, entity_id);
create index if not exists idx_attachments_geo_captured on attachments((geo->>'captured_at'))
  where entity_type = 'site_update';
