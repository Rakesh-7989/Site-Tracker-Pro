# Site-Tracker-Pro — Data Model (ER Diagrams)

> **Two planes, one bridge.**  
> The **SaaS Control Plane** belongs to *us* (the SaaS operator) — who's a customer, what
> they pay, what features they get, who the platform admins are.  
> The **App Tenant Plane** belongs to *them* (the builder firm) — their projects, BOQs,
> labour register, RA bills, drawings.  
> The two planes are **bridged by `organizations.id`** — every tenant-plane row carries
> (directly or via `project_id → projects.org_id`) the org it belongs to.  
> A single **audit spine** (`audit_log_v2`) crosses both planes so platform-level and
> tenant-level events sit on the same immutable timeline.

```
                ┌──────────────────────────────────────────────────────┐
                │            SAAS CONTROL PLANE  (operator)            │
                │   plans · admin_users · support · subscriptions      │
                │   platform_feature_flags · org_feature_flags         │
                │   org_integrations · templates · approval_chains     │
                │   notification_rules · ops_toggles · branding        │
                │   delegations · billing_history · usage_metrics      │
                └────────────────────────────┬─────────────────────────┘
                                             │
                                             │  organizations.id
                                             │  (the bridge — every
                                             │   downstream row carries it)
                                             ▼
                ┌──────────────────────────────────────────────────────┐
                │           APP TENANT PLANE  (builder firm)           │
                │   profiles · org_members · projects · project_members│
                │   milestones · tasks · site_updates · issues         │
                │   drawings · attachments · materials · inventory_txn │
                │   boq_items · estimate · vendors · purchase_orders   │
                │   invoices · ra_bills · labour_register · attendance │
                │   blocks · floors · units · daily_snapshots          │
                │   compliance · forecast · rfi · co · inspections     │
                │   safety · permits · submittals · equipment · diary  │
                │   worklogs · checklists · messages · comments        │
                └────────────────────────────┬─────────────────────────┘
                                             │
                                             │ both planes write here
                                             ▼
                ┌──────────────────────────────────────────────────────┐
                │              CROSS-PLANE AUDIT SPINE                 │
                │   audit_log_v2  (append-only, SECURITY DEFINER)      │
                │   audit_anchors (daily merkle root → Polygon)        │
                └──────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [SaaS Control Plane ER](#1-saas-control-plane-er)
2. [App Tenant Plane ER](#2-app-tenant-plane-er)
3. [The Bridge — how the two connect](#3-the-bridge--how-the-two-connect)
4. [Cross-Plane Audit Spine](#4-cross-plane-audit-spine)
5. [RLS pattern summary](#5-rls-pattern-summary)
6. [Cardinality cheatsheet](#6-cardinality-cheatsheet)
7. [Index strategy](#7-index-strategy)
8. [Migration path — which SQL file adds which table](#8-migration-path)
9. [Polymorphism notes](#9-polymorphism-notes)
10. [Quick legend](#10-quick-legend)

---

## 1. SaaS Control Plane ER

> "Tables that exist for *us* to run the SaaS — billing, tenants, feature flags,
> platform admins. The customer never directly edits most of these."

```
                                ┌──────────────────────────┐
                                │ plans                    │
                                │ ─────                    │
                                │ id           text    PK  │  ◄── seed: 'basic',
                                │ name         text        │      'pro', 'business',
                                │ monthly_inr  bigint      │      'custom'
                                │ feature_caps jsonb       │
                                │ status       text        │
                                └──────────┬───────────────┘
                                           │ 1
                                           │
                                           ▼ N
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ organizations                                                            │
   │ ─────────────                                                            │
   │ id           uuid           PK    (← THE BRIDGE)                         │
   │ slug         text           UNIQUE                                       │
   │ name         text                                                        │
   │ plan         text           FK → plans.id                                │
   │ gstin        text                                                        │
   │ pan          text                                                        │
   │ status       text           CHECK (active/suspended/trial)               │
   │ archived_at  timestamptz    (Session 25 — 90-day soft delete)            │
   │ created_at   timestamptz                                                 │
   └──────┬─────────────┬─────────────┬─────────────┬──────────────┬─────────┘
          │ 1           │ 1           │ 1           │ 1            │ 1
          │             │             │             │              │
          ▼ 1           ▼ N           ▼ 1           ▼ N            ▼ N
   ┌──────────────┐ ┌────────────┐ ┌──────────────────┐ ┌────────────────┐ ┌──────────────┐
   │ subscriptions│ │ billing_   │ │ org_integrations │ │ templates      │ │ approval_    │
   │ ─────        │ │ history    │ │ ─────            │ │ ─────          │ │ chains       │
   │ org_id  PK   │ │ (planned)  │ │ org_id  PK       │ │ id       PK    │ │ ─────        │
   │ provider     │ │ ─────      │ │ ai      jsonb    │ │ org_id   FK    │ │ org_id  PK   │
   │ external_id  │ │ org_id  FK │ │ razorpay jsonb   │ │ kind     text  │ │ resource PK  │
   │ plan         │ │ amount     │ │ whatsapp jsonb   │ │ name     text  │ │ name         │
   │ status       │ │ status     │ │ cashfree jsonb   │ │ payload  jsonb │ │ rungs   jsonb│
   │ period_start │ │ paid_at    │ │ updated_at       │ │ created_by FK  │ │ updated_at   │
   │ period_end   │ └────────────┘ │ updated_by   FK  │ └────────────────┘ └──────────────┘
   │ trial_ends   │                └──────────────────┘
   │ updated_at   │
   └──────────────┘

   organizations (cont.)
          │ 1            │ 1            │ 1             │ 1
          ▼ N            ▼ N            ▼ N             ▼ N
   ┌──────────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────────────┐
   │ notification_    │ │ org_feature_ │ │ branding   │ │ ops_toggles          │
   │ rules            │ │ flags        │ │ ─────      │ │ ─────                │
   │ ─────            │ │ ─────        │ │ org_id PK  │ │ org_id   PK (with    │
   │ id      PK       │ │ org_id PK    │ │ logo_url   │ │   key)               │
   │ org_id  FK       │ │ key     PK   │ │ accent     │ │ key      PK          │
   │ trigger text     │ │ enabled bool │ │ letterhead │ │ value    jsonb       │
   │ channel text     │ │ updated_at   │ │ project_id │ │ updated_at           │
   │ recipients uuid[]│ └──────────────┘ │   nullable │ │   e.g. onboarding_   │
   │ enabled  bool    │                  └────────────┘ │   done_<org_id>      │
   └──────────────────┘                                 └──────────────────────┘


                       ┌─────────────────────────┐    ┌─────────────────────────┐
                       │ admin_users             │    │ support                 │
                       │ ─────                   │    │ ─────                   │
                       │ id        uuid    PK    │    │ id        uuid    PK    │
                       │ email     text    UNIQUE│    │ email     text    UNIQUE│
                       │ name      text          │    │ name      text          │
                       │ role      text          │    │ role      text          │
                       │   superadmin / support  │    │ tickets_owned  int      │
                       │ last_login timestamptz  │    │ created_at              │
                       │ created_at              │    └─────────────────────────┘
                       └─────────────────────────┘    (us — the SaaS team. NOT
                       (platform-level — sits        a tenant user. Stored here
                       OUTSIDE the org boundary.)    for support handoff tracking.)


                       ┌────────────────────────────────────────────┐
                       │ platform_feature_flags                     │
                       │ ─────                                      │
                       │ key       text           PK                │
                       │ enabled   boolean        (kill switch)     │
                       │ rollout   numeric(5,2)   (0-100 % opt-in)  │
                       │ note      text                             │
                       │ updated_at timestamptz                     │
                       │   e.g. boq_paste_import, ar_overlay        │
                       └────────────────────────────────────────────┘
                       (Super Admin only. Trumps org_feature_flags.)


                       ┌────────────────────────────────────────────┐
                       │ usage_metrics  (planned — Phase 2)         │
                       │ ─────                                      │
                       │ org_id    uuid     FK                      │
                       │ day       date                             │
                       │ metric    text     (active_users,          │
                       │                     projects_open, …)      │
                       │ value     bigint                           │
                       │   PK (org_id, day, metric)                 │
                       └────────────────────────────────────────────┘


                       ┌────────────────────────────────────────────┐
                       │ delegations                                │
                       │ ─────                                      │
                       │ id         uuid    PK                      │
                       │ org_id     uuid    FK                      │
                       │ from_user  uuid    FK → profiles.id        │
                       │ to_user    uuid    FK → profiles.id        │
                       │ resource   text                            │
                       │ start_at   timestamptz                     │
                       │ end_at     timestamptz                     │
                       │ reason     text                            │
                       │ revoked_at timestamptz                     │
                       └────────────────────────────────────────────┘
                       (Sits in control plane because it gates
                        approval chains across the whole org.)
```

**Control-plane summary:**

| Table | Granularity | Who writes | Sensitive? |
|---|---|---|---|
| `plans` | global | superadmin (us) | No |
| `organizations` | tenant | superadmin / org_admin signup | PII (gstin/pan) |
| `subscriptions` | tenant | Cashfree webhook (service_role) | Financial |
| `billing_history` | tenant | Cashfree webhook | Financial |
| `org_integrations` | tenant | org_admin | Secrets (jsonb keys) |
| `templates` | tenant | org_admin | No |
| `approval_chains` | tenant | org_admin | No |
| `notification_rules` | tenant | org_admin | No |
| `org_feature_flags` | tenant | org_admin | No |
| `branding` | tenant or project | org_admin | No |
| `ops_toggles` | tenant | tenant user | No (operational state) |
| `admin_users` | global | superadmin | High |
| `support` | global | superadmin | Medium |
| `platform_feature_flags` | global | superadmin | No |
| `usage_metrics` | tenant | system cron | No |
| `delegations` | tenant | user (delegator) | Medium |

---

## 2. App Tenant Plane ER

> "Tables that belong to the firm itself — their projects, BOQs, labour register,
> RA bills, drawings, attendance. RLS scopes every row to `org_id`."

### 2.1 Identity sub-graph

```
   ┌──────────────────────────────────┐
   │ profiles (auth.users mirror)     │
   │ ─────                            │
   │ id          uuid   PK            │
   │ name        text                 │
   │ avatar      text                 │
   │ role        text                 │  ◄── 19 enum values (v1 6 + v2 12 + vendor)
   │ created_at  timestamptz          │      Updated by 07_role_expansion.sql
   └─────┬───────────────────┬────────┘
         │ 1                 │ 1
         │                   │
         ▼ N                 ▼ N
   ┌──────────────────┐  ┌──────────────────────────┐
   │ org_members      │  │ project_members          │
   │ ─────            │  │ ─────                    │
   │ org_id      FK   │  │ project_id     FK        │
   │ profile_id  FK   │  │ profile_id     FK        │
   │ role        text │  │ project_role   text      │
   │ joined_at        │  │ added_at                 │
   │   PK (org_id,    │  │   PK (project_id,        │
   │       profile_id)│  │       profile_id)        │
   └──────┬───────────┘  └────────────┬─────────────┘
          │ N                         │ N
          ▼ 1                         ▼ 1
   ┌──────────────┐              ┌────────────┐
   │ organizations│              │ projects   │
   └──────────────┘              └────────────┘
   (control plane)              (tenant plane)
```

### 2.2 Project + hierarchy sub-graph

```
   ┌────────────────────────────────────────────────┐
   │ projects                                       │
   │ ─────                                          │
   │ id            uuid  PK                         │
   │ org_id        uuid  FK → organizations.id      │  ◄── THE BRIDGE
   │ type          text  CHECK (construction /      │      construction|interior|
   │                            interior / design / │      design|consultant
   │                            consultant)         │      (added by 06_project_types.sql)
   │ architect_id  uuid  FK → profiles.id           │
   │ name          text                             │
   │ description   text                             │
   │ location, lat, lng                             │
   │ status        text  CHECK (active/completed/   │
   │                            on_hold/cancelled)  │
   │ progress      smallint  (0-100)                │
   │ budget        bigint                           │
   │ start_date    date                             │
   │ expected_end_date date                         │
   │ client_name, client_email                      │
   │ archived_at   timestamptz                      │  ◄── 08_project_archive.sql
   │ created_at, updated_at                         │
   └──────┬─────────────────────────────────────────┘
          │ 1
          │
          ▼ N
   ┌──────────────────┐
   │ blocks           │   (e.g. "Tower A", "Tower B")
   │ ─────            │
   │ id           PK  │
   │ project_id   FK  │
   │ name         text│
   │ sort_order   int │
   └──────┬───────────┘
          │ 1
          ▼ N
   ┌──────────────────┐
   │ floors           │   (e.g. "Tower A · Floor 7")
   │ ─────            │
   │ id           PK  │
   │ block_id     FK  │
   │ level        int │
   │ name         text│
   └──────┬───────────┘
          │ 1
          ▼ N
   ┌──────────────────────────────────────┐
   │ units                                │   (e.g. "Tower A · F7 · 7B")
   │ ─────                                │
   │ id           PK                      │
   │ floor_id     FK                      │
   │ unit_code    text                    │
   │ unit_type    text  (1BHK/2BHK/etc.)  │
   │ carpet_sqft  numeric                 │
   │ status       text  (planned/handover)│
   └──────────────────────────────────────┘
```

### 2.3 Work execution sub-graph

```
   projects ──┬──► milestones ──► tasks
              │
              ├──► site_updates  (DPR — daily progress reports)
              │
              ├──► issues
              │
              ├──► rfi          (Request For Information)
              │
              ├──► co           (Change Orders)
              │
              ├──► inspections
              │
              ├──► safety
              │
              ├──► checklists
              │
              ├──► punch        (punch list — defect tracking near handover)
              │
              ├──► submittals   (drawings/specs awaiting approval)
              │
              ├──► permits
              │
              ├──► daily_snapshots  (immutable EOD freeze)
              │
              ├──► forecast        (AI cost/schedule predictions)
              │
              └──► compliance      (project-level RERA/GST filings)
```

Box for the canonical `milestones`/`tasks`:

```
   ┌──────────────────────────────┐
   │ milestones                   │
   │ ─────                        │
   │ id            uuid     PK    │
   │ project_id    uuid     FK    │
   │ title         text           │
   │ status        text           │  pending/in_progress/completed
   │ due_date      date           │
   │ completed_date date          │
   │ sort_order    int            │
   └──────┬───────────────────────┘
          │ 1
          ▼ N
   ┌──────────────────────────────┐
   │ tasks                        │
   │ ─────                        │
   │ id            uuid     PK    │
   │ project_id    uuid     FK    │
   │ milestone_id  uuid     FK    │  (nullable — orphan tasks ok)
   │ title         text           │
   │ assignee_name text           │
   │ due_date      date           │
   │ priority      text           │
   │ status        text           │
   └──────────────────────────────┘
```

### 2.4 Drawings + Attachments sub-graph

```
   ┌─────────────────────────────────────────────────┐
   │ drawings                                        │
   │ ─────                                           │
   │ id              uuid     PK                     │
   │ project_id      uuid     FK                     │
   │ title           text                            │
   │ type            text                            │
   │ revision        text                            │  default 'Rev A'
   │ status          text                            │  current | superseded
   │ superseded_by   uuid     FK → drawings.id       │  (self-FK — version chain)
   │ released_to     text[]                          │  subset of {pm,contractor,client}
   │ released_by     uuid     FK → profiles.id       │
   │ release_date    date                            │
   │ storage_path    text                            │  Supabase Storage object key
   │                                                 │
   │ EXCLUSION CONSTRAINT:                           │
   │   one "current" per (project, title, type)      │
   └──────────────────┬──────────────────────────────┘
                      │
                      │ exclusion + self-FK = automatic version chain
                      │
                      ▼
                 history graph


   ┌───────────────────────────────────────────────────────┐
   │ attachments  (polymorphic)                            │
   │ ─────                                                 │
   │ id            uuid     PK                             │
   │ project_id    uuid     FK                             │
   │ entity_type   text                                    │  ◄── 19 enum values
   │ entity_id     uuid                                    │      (drawings/issues/
   │ storage_path  text                                    │       pos/ra_bills/etc.)
   │ original_name text                                    │
   │ size          bigint                                  │
   │ mime          text                                    │
   │ kind          text                                    │  image/pdf/cad/doc/sheet
   │ geo           jsonb                                   │  {lat,lng,captured_at}
   │ uploaded_by   uuid     FK → profiles.id               │
   │ uploaded_at   timestamptz                             │
   │                                                       │
   │ INDEX: (entity_type, entity_id)                       │
   │ INDEX: (geo->>captured_at) WHERE entity_type='update' │
   └───────────────────────────────────────────────────────┘
```

### 2.5 Procurement + Inventory sub-graph

```
   organizations
        │ 1
        ▼ N
   ┌──────────────────────────────┐
   │ vendors                      │      ← org-level master
   │ ─────                        │
   │ id          uuid    PK       │
   │ org_id      uuid    FK       │
   │ name        text             │
   │ category    text             │
   │ phone       text             │
   │ gst         text             │   ◄── GSTIN
   │ rating      numeric(2,1)     │
   └──────┬───────────────────────┘
          │ 1
          │
          ▼ N
   ┌──────────────────────────────────┐
   │ purchase_orders                  │     ← project-level
   │ ─────                            │
   │ id           uuid    PK          │
   │ project_id   uuid    FK          │
   │ vendor_id    uuid    FK          │
   │ po_no        text                │
   │ items        text                │
   │ amount       bigint              │
   │ gst          numeric(4,2)        │
   │ status       text                │   pending/approved/delivered/cancelled
   │ created_date date                │
   │ delivery_date date               │
   └──────┬───────────────────────────┘
          │ 1
          │
          ▼ N
   ┌──────────────────────────────────────┐
   │ inventory_transactions  (= ledger)   │
   │ ─────                                │
   │ id            uuid    PK             │
   │ project_id    uuid    FK             │
   │ txn_date      date                   │
   │ material      text                   │
   │ unit          text                   │
   │ qty           numeric(14,3)          │
   │ direction     text                   │   inward/outward/return/wastage
   │ source        text                   │
   │ ref_no        text                   │
   │ po_id         uuid    FK → purchase_orders.id      (nullable)
   │ recorded_by   uuid    FK → profiles.id             │
   │ attachments   jsonb                  │
   └──────────────────────────────────────┘


   ┌──────────────────────────────────┐    ┌───────────────────────────────┐
   │ materials                        │    │ material_prices               │
   │ ─────                            │    │ ─────                         │
   │ id          uuid    PK           │    │ id           uuid    PK       │
   │ project_id  uuid    FK           │    │ org_id       uuid    FK       │
   │ material    text                 │    │ material     text             │
   │ quantity    text                 │    │ unit         text             │
   │ supplier    text                 │    │ rate         numeric          │
   │ delivery_date date               │    │ source       text             │
   │ status      text                 │    │ effective_at timestamptz      │
   │   expected/received/rejected     │    └───────────────────────────────┘
   │ logged_by   uuid    FK           │    (org-scoped price master —
   └──────────────────────────────────┘     consumed by BOQ + PO suggest)
   (project-level material plan —
    distinct from inventory ledger.)
```

### 2.6 Cost + Billing sub-graph

```
   projects ──► boq_items  (Bill of Quantities)
   ┌──────────────────────────────────────┐
   │ boq_items                            │
   │ ─────                                │
   │ id          uuid    PK               │
   │ project_id  uuid    FK               │
   │ code        text                     │
   │ description text                     │
   │ unit        text                     │
   │ qty         numeric(14,3)            │
   │ rate        numeric(14,2)            │
   │ amount      numeric(16,2)            │  ◄── GENERATED qty*rate STORED
   │ category    text                     │
   │ sort_order  int                      │
   └──────────────────────────────────────┘


   ┌──────────────────────────────────────┐
   │ estimate (planned — TBD migration)   │
   │ ─────                                │
   │ id          uuid    PK               │
   │ project_id  uuid    FK               │
   │ name        text                     │
   │ version     int                      │
   │ payload     jsonb                    │   (BOQ snapshot at bid time)
   │ approved_at timestamptz              │
   └──────────────────────────────────────┘


   ┌──────────────────────────────────────────┐    ┌──────────────────────────┐
   │ invoices                                 │    │ ra_bills                 │
   │ ─────                                    │    │ ─────                    │
   │ id            uuid    PK                 │    │ id           uuid    PK  │
   │ project_id    uuid    FK                 │    │ project_id   uuid    FK  │
   │ milestone_id  uuid    FK    (nullable)   │    │ no           text        │
   │ no            text                       │    │ subcontractor text       │
   │ amount        bigint                     │    │ scope        text        │
   │ gst           numeric(4,2)               │    │ bill_amount  bigint      │
   │ tds           numeric(4,2)               │    │ cumulative   bigint      │
   │ status        text                       │    │ retention_pct numeric    │
   │   sent/paid/overdue/cancelled            │    │ paid_amount  bigint      │
   │ issued_date   date                       │    │ status       text        │
   │ paid_date     date                       │    │   submitted/approved/    │
   └──────────────────────────────────────────┘    │   paid/rejected          │
                                                   │ bill_date    date        │
                                                   └──────────────────────────┘

   (RA = Running Account bill. Linked to MB measurements + BOQ items in app
    layer; FK to a measurement_book table TBD when MB migrates from seed.)
```

### 2.7 Workforce sub-graph

```
   projects
       │ 1
       │
       ├─► labour_register
       │       ┌──────────────────────────────────┐
       │       │ labour_register                  │
       │       │ ─────                            │
       │       │ id        uuid   PK              │
       │       │ project_id uuid  FK              │
       │       │ name      text                   │
       │       │ aadhaar   text   (MASKED IN UI)  │  ← raw value never returned via REST
       │       │ epf       text                   │
       │       │ esi       text                   │
       │       │ trade     text                   │
       │       │ wage      numeric(8,2)           │
       │       │ joined    date                   │
       │       └──────────────────────────────────┘
       │
       ├─► attendance (TBD — currently in seed)
       │       per (project_id, labour_id, date) — present/absent/half-day
       │
       ├─► worklogs (TBD — currently in seed)
       │       per (project_id, profile_id, date, hours, activity)
       │
       ├─► teams (TBD — currently in seed)
       │       per-project crew rosters
       │
       ├─► diary (TBD — currently in seed)
       │       per (project_id, date, weather, notes)
       │
       └─► equipment (TBD — currently in seed)
               per (project_id, equipment_id, status, last_maintenance)
```

### 2.8 Communication + Activity sub-graph

```
   projects ──► messages    (in-app DMs scoped to project)
            ──► comments    (threaded on any entity_type+entity_id)
            ──► activity_log (v1 trail — per project, mutable)
            ──► notifications

   ┌──────────────────────────────────────┐
   │ activity_log (v1 — per-project)      │  ◄── separate from audit_log_v2
   │ ─────                                │      Mutable; subjective; UI feed.
   │ id          uuid    PK               │
   │ project_id  uuid    FK               │
   │ type        text                     │
   │ action      text                     │
   │ detail      text                     │
   │ by_profile_id uuid  FK               │
   │ by_name     text                     │
   │ by_role     text                     │
   │ created_at  timestamptz              │
   │   INDEX: (project_id, created_at desc)│
   └──────────────────────────────────────┘
```

### 2.9 Compliance + Forecast sub-graph

```
   ┌────────────────────────────────────────────┐
   │ compliance                                 │
   │ ─────                                      │
   │ id           uuid    PK                    │
   │ org_id       uuid    FK                    │
   │ project_id   uuid    FK    (nullable)      │  ← org-level (GST) vs project (RERA)
   │ kind         text    CHECK (rera/gst/epfo) │
   │ ref_no       text                          │
   │ stage        text                          │   for RERA: 'foundation','plinth','7th_floor', …
   │ status       text                          │   pending/filed/accepted/rejected
   │ filed_at     timestamptz                   │
   │ expires_at   timestamptz                   │
   │ payload      jsonb                         │
   └────────────────────────────────────────────┘

   ┌────────────────────────────────────────────┐
   │ daily_snapshots                            │
   │ ─────                                      │
   │ id           uuid    PK                    │
   │ project_id   uuid    FK                    │
   │ snapshot_date date                         │
   │ progress     smallint                      │
   │ spend        bigint                        │
   │ labour_count smallint                      │
   │ summary      jsonb                         │
   │ frozen_at    timestamptz                   │
   │   UNIQUE (project_id, snapshot_date)       │
   └────────────────────────────────────────────┘
   (Immutable EOD freeze — drives Gantt baseline + AI training data.)

   ┌────────────────────────────────────────────┐
   │ forecast                                   │
   │ ─────                                      │
   │ id           uuid    PK                    │
   │ project_id   uuid    FK                    │
   │ generated_at timestamptz                   │
   │ horizon_days int                           │
   │ predicted_end date                         │
   │ predicted_cost bigint                      │
   │ risk_score   numeric(4,2)                  │
   │ rationale    text                          │   LLM-generated, lang-aware
   │ model        text                          │
   └────────────────────────────────────────────┘
```

### 2.10 Process sub-graph (RFI / CO / Inspections / Safety)

```
   projects
       │
       ├─► rfi          (Request For Information)
       │      id, no, question, asked_by, status, response, response_by, due_date
       │
       ├─► co           (Change Order)
       │      id, no, scope_change, cost_impact, schedule_impact, approved_by
       │
       ├─► inspections
       │      id, type, scheduled_date, inspector_name, result, photos[]
       │
       ├─► safety
       │      id, incident_date, severity, description, action_taken
       │
       ├─► checklists
       │      id, template_id, item, status, completed_by
       │
       ├─► punch        (defect list near handover)
       │      id, location, trade, defect, status, assigned_to
       │
       ├─► submittals
       │      id, type, ref, submitted_by, status (pending/approved/rejected)
       │
       └─► permits
              id, kind, issuing_authority, ref_no, valid_until
```

---

## 3. The Bridge — how the two connect

The single fact that ties both planes together:

```
      organizations.id  ◄────────────────────────────────────────┐
            ▲                                                     │
            │ FK (direct)                                         │
            │                                                     │
            ├── subscriptions.org_id        (control plane)       │
            ├── org_integrations.org_id     (control plane)       │
            ├── templates.org_id            (control plane)       │
            ├── approval_chains.org_id      (control plane)       │
            ├── notification_rules.org_id   (control plane)       │
            ├── org_feature_flags.org_id    (control plane)       │
            ├── branding.org_id             (control plane)       │
            ├── ops_toggles.org_id          (control plane)       │
            ├── delegations.org_id          (control plane)       │
            │                                                     │
            ├── org_members.org_id          (tenant plane)        │
            ├── projects.org_id             (tenant plane) ───────┘
            ├── vendors.org_id              (tenant plane)
            ├── material_prices.org_id      (tenant plane)
            ├── compliance.org_id           (tenant plane)
            │                                                     ┌──────────────────┐
            │                                                     │  projects.id is  │
            │                                                     │  the secondary   │
            │                                                     │  bridge — every  │
            │ FK (indirect, via projects.org_id rollup):           │  per-project row │
            │                                                     │  inherits the    │
            ├── milestones.project_id    ──► projects.org_id      │  org via this    │
            ├── tasks.project_id         ──► projects.org_id      │  FK.             │
            ├── site_updates.project_id  ──► projects.org_id      └──────────────────┘
            ├── issues.project_id        ──► projects.org_id
            ├── drawings.project_id      ──► projects.org_id
            ├── attachments.project_id   ──► projects.org_id
            ├── materials.project_id     ──► projects.org_id
            ├── inventory_transactions.project_id ──► projects.org_id
            ├── boq_items.project_id     ──► projects.org_id
            ├── purchase_orders.project_id ──► projects.org_id
            ├── invoices.project_id      ──► projects.org_id
            ├── ra_bills.project_id      ──► projects.org_id
            ├── labour_register.project_id ──► projects.org_id
            ├── activity_log.project_id  ──► projects.org_id
            ├── blocks/floors/units.project_id ──► projects.org_id
            ├── daily_snapshots.project_id ──► projects.org_id
            └── forecast.project_id      ──► projects.org_id
```

### How the bridge is enforced at runtime

```
Browser request with user JWT
        │
        ▼
Postgres parses JWT → sets app.tenant_id = JWT.app_metadata.tenant_id
        │
        ▼
RLS policy on every tenant table:
        USING (
          is_superadmin()  -- platform escape hatch
          or org_id = user_org_id()
          -- OR for per-project tables:
          or project_id in (select user_project_ids())
        )
        │
        ▼
Rows leave Postgres ONLY if the policy returns true.
```

`user_org_id()` and `user_project_ids()` are SECURITY DEFINER helpers defined in
[scripts/supabase/03_rls_phase1.sql](scripts/supabase/03_rls_phase1.sql:25-65).
They are the *single point* where tenant boundaries are computed; every policy
references them.

### Connection cardinality summary

```
1 plan          ──< N organizations
1 organization  ──< 1 subscription
1 organization  ──< N projects
1 organization  ──< N vendors
1 organization  ──< N profiles via org_members
1 project       ──< N milestones, tasks, drawings, BOQ items, …
1 vendor        ──< N purchase_orders
1 purchase_order ──< N inventory_transactions (inward)
1 milestone     ──< N tasks
1 drawing       ──< 1 superseded_by (drawing) — self-FK chain
```

---

## 4. Cross-Plane Audit Spine

The single table that spans both planes — every meaningful event lands here.

```
   ┌────────────────────────────────────────────────────────────────┐
   │ audit_log_v2  (append-only)                                    │
   │ ─────                                                          │
   │ id           uuid    PK                                        │
   │ org_id       uuid    FK → organizations.id   (nullable)        │  ◄── platform events
   │ project_id   uuid    FK → projects.id        (nullable)        │      may have NULL org
   │ actor_id     uuid    FK → profiles.id                          │      (system actor)
   │ actor_name   text                                              │
   │ actor_role   text                                              │
   │ action       text    CHECK (12 values)                         │   CREATE/UPDATE/DELETE
   │                                                                │   APPROVE/REJECT/RELEASE
   │                                                                │   UPLOAD/LOGIN/IMPERSONATE
   │                                                                │   EXPORT/PAYMENT/DELEGATE
   │ resource     text                                              │   table name (lowercase)
   │ resource_id  text                                              │   PK as text (polymorphic)
   │ before       jsonb                                             │
   │ after        jsonb                                             │
   │ message      text                                              │
   │ ts           timestamptz                                       │
   │                                                                │
   │ INDEX: (org_id, ts desc)                                       │
   │ INDEX: (project_id, ts desc)                                   │
   │                                                                │
   │ POLICY: INSERT only via SECURITY DEFINER record_audit_v2()     │
   │ POLICY: UPDATE / DELETE revoked for `authenticated`            │
   └──────────────────┬─────────────────────────────────────────────┘
                      │ 1 per day
                      ▼ 1
   ┌────────────────────────────────────────────────────────────────┐
   │ audit_anchors  (planned — Polygon checkpoint)                  │
   │ ─────                                                          │
   │ day          date    PK                                        │
   │ row_count    bigint                                            │
   │ merkle_root  bytea   (32-byte sha256 root)                     │
   │ tx_hash      text                                              │
   │ block_number bigint                                            │
   │ network      text    default 'polygon-mainnet'                 │
   │ anchored_at  timestamptz                                       │
   └────────────────────────────────────────────────────────────────┘
```

### How the spine sees both planes

```
Examples of events with org_id=set, project_id=NULL  (control-plane only):
   action=CREATE   resource=organization     resource_id=<new_org_uuid>
   action=UPDATE   resource=subscription     resource_id=<org_uuid>
   action=UPDATE   resource=org_feature_flag resource_id=<key>
   action=PAYMENT  resource=invoice          resource_id=<cashfree_payment_id>

Examples with both set (tenant-plane events):
   action=APPROVE  resource=ra_bill          resource_id=<ra_bill_uuid>
   action=RELEASE  resource=drawing          resource_id=<drawing_uuid>
   action=DELETE   resource=labour_register  resource_id=<labour_uuid>

Examples with both NULL (system events):
   action=LOGIN     resource=admin           resource_id=<admin_user_uuid>
   action=IMPERSONATE resource=organization  resource_id=<org_uuid>
```

### The hash chain

```
Per audit row:
   hash = sha256( canonical_json({
            org_id, project_id, actor_id, action, resource,
            resource_id, before, after, ts
          }) )

Per day (cron at 00:30 IST):
   day_rows = SELECT * FROM audit_log_v2
              WHERE ts::date = yesterday
              ORDER BY id
   leaves   = [hashAuditRow(r) for r in day_rows]
   root     = merkleRoot(leaves)
   tx       = polygonAdapter.anchor(root)
   INSERT INTO audit_anchors VALUES (yesterday, n, root, tx.hash, tx.block, 'polygon-mainnet', now())
```

Pure-function library: [src/lib/blockchainAnchor.js](src/lib/blockchainAnchor.js) + 33 tests.

---

## 5. RLS pattern summary

Four reusable patterns cover every table:

```
PATTERN A — Platform-only
  USING (is_superadmin())
  Used by: plans, admin_users, support, platform_feature_flags

PATTERN B — Org-scoped (orgadmin can write, members can read)
  read:  USING (is_superadmin() or org_id = user_org_id())
  write: USING ((is_orgadmin() and org_id = user_org_id())
                or is_superadmin())
  Used by: org_integrations, templates, approval_chains,
           notification_rules, org_feature_flags, vendors,
           material_prices, delegations, branding,
           organizations (write only — read is liberal)

PATTERN C — Project-scoped (members of the project)
  USING (project_id in (select user_project_ids()))
  Used by: milestones, tasks, site_updates, issues, drawings,
           materials, inventory_transactions, boq_items,
           purchase_orders, invoices, ra_bills, labour_register,
           attachments (via project_id), activity_log,
           blocks/floors/units, daily_snapshots, forecast,
           compliance (project-scoped rows)

PATTERN D — Public share (token-based, no RLS check beyond token validity)
  Enforced in App at the ClientShareView layer; share tokens carry
  signed expiry + scope. Backed by a future `share_tokens` table.
  Used by: ClientShareView, "share this drawing" links
```

All four patterns share one helper:

```sql
create or replace function user_project_ids() returns setof uuid
language sql stable security definer as $$
  -- superadmin → all projects
  -- project_members rows → directly assigned
  -- architect / org_admin → all projects in their org
  -- client → projects matching their email
$$;
```

See [scripts/supabase/03_rls_phase1.sql:42-65](scripts/supabase/03_rls_phase1.sql).

---

## 6. Cardinality cheatsheet

```
plans                  1 ───< N  organizations
organizations          1 ───< 1  subscription
organizations          1 ───< N  org_members (M:N to profiles)
organizations          1 ───< N  projects
organizations          1 ───< N  vendors
organizations          1 ───< N  templates / approval_chains / notification_rules
projects               1 ───< N  milestones
projects               1 ───< N  tasks (also can hang off a milestone)
projects               1 ───< N  blocks ───< N floors ───< N units
projects               1 ───< N  drawings (with self-FK version chain)
projects               1 ───< N  boq_items
projects               1 ───< N  ra_bills
projects               1 ───< N  labour_register entries
projects               1 ───< N  inventory_transactions
projects               1 ───< N  daily_snapshots
purchase_orders        1 ───< N  inventory_transactions (inward txns)
milestones             1 ───< N  tasks (optional)
milestones             1 ───< N  invoices (optional — milestone-linked billing)
drawings               1 ───< 1  superseded_by → drawings (chain)
profiles               N ───M N  org_members
profiles               N ───M N  project_members
attachments            polymorphic — 1 attachment row → 1 (entity_type, entity_id)
audit_log_v2           N rows per day → 1 audit_anchors row per day
```

---

## 7. Index strategy

Critical indexes that exist or must exist:

```
projects(org_id)                          — every tenant query starts here
projects(type)                            — added by 06_project_types.sql
projects(archived_at) WHERE not null      — added by 08_project_archive.sql

milestones(project_id)
tasks(project_id, status)
tasks(milestone_id)                       — for milestone roll-up

drawings(project_id)
drawings(project_id, lower(title), lower(type)) WHERE status='current'   — exclusion constraint

attachments(entity_type, entity_id)
attachments(geo->>'captured_at') WHERE entity_type='site_update'

inventory_transactions(project_id, material)
inventory_transactions(project_id, txn_date desc)

boq_items(project_id)

vendors(org_id)
purchase_orders(project_id, status)
ra_bills(project_id, status)

activity_log(project_id, created_at desc)
audit_log_v2(org_id, ts desc)
audit_log_v2(project_id, ts desc)

org_members(org_id, profile_id)           — PK
project_members(project_id, profile_id)   — PK

templates(org_id, kind)
notification_rules(org_id)
approval_chains(org_id, resource)         — PK

daily_snapshots(project_id, snapshot_date)  — UNIQUE
```

---

## 8. Migration path

Which SQL file introduces which table:

| File | Tables added |
|---|---|
| `01_schema.sql` | profiles, organizations, org_members, projects, project_members, milestones, tasks, site_updates, issues, drawings, materials, inventory_transactions, boq_items, vendors, purchase_orders, invoices, ra_bills, labour_register, activity_log, attachments |
| `02_rls.sql` | (no new tables — RLS policies + helper functions only) |
| `03_rls_phase1.sql` | org_integrations, templates, approval_chains, notification_rules, audit_log_v2, subscriptions |
| `04_rls_tests.sql` | (assertions only) |
| `05_rls_phase1_tests.sql` | (assertions only) |
| `06_project_types.sql` | (adds `projects.type` column) |
| `07_role_expansion.sql` | (extends profiles.role enum + write policies) |
| `08_project_archive.sql` | (adds `projects.archived_at` column) |
| `09_hierarchy.sql` | blocks, floors, units (with cascade FKs + RLS) |
| `10_measurement_book.sql` | measurement_book (append-only, MB-RA linkage) |
| `11_material_prices.sql` | material_prices (org-level price master) |
| `12_delegations.sql` | delegations (approval handoff + helper indexes) |
| `13_daily_snapshots.sql` | daily_snapshots (immutable EOD freeze) |
| `14_compliance.sql` | compliance (org GST/EPFO + project RERA) |
| `15_forecast.sql` | forecast (AI prediction history) |
| `16_process_tables.sql` | rfi, change_orders, inspections, safety |
| `17_handover_tables.sql` | punch, submittals, permits |
| `18_checklists.sql` | checklist_items |
| `19_comms.sql` | messages, comments (polymorphic), notifications |
| `20_workforce.sql` | teams, attendance, worklogs |
| `21_field_ops.sql` | equipment, diary, expenses |
| `22_estimate.sql` | estimate (versioned bid baseline) |
| `23_branding.sql` | branding (org default + project override) |
| `24_feature_flags.sql` | platform_feature_flags, org_feature_flags, ops_toggles |
| `25_billing_telemetry.sql` | billing_history, usage_metrics |
| `26_share_tokens.sql` | share_tokens + validate_share_token() RPC |
| `27_audit_anchors.sql` | audit_anchors + audit_anchor_status view |
| `28_plans.sql` | plans (replaces hard-coded enum; seeds 4 plans) |
| `29_phase2_tests.sql` | assertion harness for all 09-28 tables + RLS + immutability |

**Phase 2 status:** all 20 previously-TBD tables are now migrated (Session 27).
Each file is idempotent + RLS-enabled + indexed + ends with a sanity `raise notice`.
`29_phase2_tests.sql` reports pass/fail for every expected table, RLS-enabled flag,
and the immutability check on the 5 append-only tables.

**Still seed-only (intentional — pure UI/computed state):**

```
INIT_ACTIVITY    — covered by activity_log (01) + audit_log_v2 (03)
INIT_NOTIFS      — superseded by notifications table (19)
INIT_LEDGER      — superseded by inventory_transactions (01)
```

The remaining seed exports are operational caches with no DB equivalent needed.

---

## 9. Polymorphism notes

Three polymorphic patterns exist; each is a deliberate trade-off.

### 9.1 `attachments` (entity_type + entity_id)

```
   attachments
   ─────
   entity_type text  CHECK (19 enum values)
   entity_id   uuid  (FK NOT enforced — application-level)
```

Why polymorphic: 19 different entity types can have attachments. A separate
join table per type would mean 19 tables and 19 RLS policies. The polymorphic
column keeps it one table + one policy.

Cost: no FK integrity. If a drawing is deleted, its attachment rows can dangle.
Mitigated by: a nightly cleanup query, and the fact that `project_id` is the
primary RLS scope (so a dangling row is still org-scoped).

### 9.2 `audit_log_v2` (resource + resource_id)

```
   audit_log_v2
   ─────
   resource    text  (table name, lowercased)
   resource_id text  (PK as text — UUID, int, composite — anything)
```

Why text not uuid: some audit targets are platform-level (e.g.
`resource='admin_user', resource_id=<email>`). Forcing UUID would lose those.

Cost: typos in `resource` strings. Mitigated by: `recordAudit()` wrapper in
[src/lib/audit.js](src/lib/audit.js) using a constant set; rejected if not in
the allow-list.

### 9.3 `branding` (org default vs project override)

```
   branding
   ─────
   org_id     uuid  FK → organizations.id   NOT NULL
   project_id uuid  FK → projects.id        NULLABLE
```

When `project_id IS NULL`, the row is the org-level default. When set, it's a
per-project override (e.g. white-label PDF letterheads for a high-net-worth
client). Resolution function: [src/lib/branding.js](src/lib/branding.js) →
`resolveBranding(org, project)`.

---

## 10. Quick legend

```
PK     primary key
FK     foreign key (cascade unless noted)
M:N    many-to-many (junction table named like *_members)
1───<N one-to-many; the < points to the many side
jsonb  Postgres JSON binary; queryable with -> and ->>
text[] Postgres text array
CHECK  inline CHECK constraint
EXCL.  Postgres exclusion constraint (rare but used for "one current
       drawing per (project, title, type)")
TBD    table exists in seed but not yet migrated to a SQL file
```

---

## 11. Reading order for engineers

1. Read this doc top-to-bottom.
2. Open [scripts/supabase/01_schema.sql](scripts/supabase/01_schema.sql) — the
   tables in §2.1–§2.6 are *all* in this file. The boxes in this doc are abridged
   versions of the real DDL.
3. Read [scripts/supabase/03_rls_phase1.sql](scripts/supabase/03_rls_phase1.sql)
   for the control-plane additions + the RLS pattern.
4. Skim [src/data/seed.js](src/data/seed.js) to see the runtime shapes — every
   `INIT_*` constant matches a future table column-for-column.
5. Confirm cross-references in [src/App.jsx](src/App.jsx) imports — the same
   identifiers appear there.

---

## 12. Open design questions

1. **Should `org_feature_flags` and `ops_toggles` merge?** They're both
   per-org key/value bags. Kept separate today because flags are admin-facing
   and toggles are operational (e.g. `onboarding_done`). Revisit at Phase 2.
2. **Should `attendance` be a child of `labour_register` or of `project`?**
   Current seed makes it per-project; alternative is per-labour-entry.
   The labour-entry FK would force "no attendance without a register entry" —
   stricter integrity, more friction at site-gate kiosk.
3. **`compliance` table dual-purpose (org + project).** Could split into
   `org_compliance` and `project_compliance`. Single table is simpler today;
   split if we hit RLS complexity beyond a couple of policies.
4. **`activity_log` vs `audit_log_v2` — do we need both?** Yes, today.
   `activity_log` is the friendly per-project feed (mutable, can be edited);
   `audit_log_v2` is the immutable legal trail. They serve different consumers.

---

*Last updated: Session 26 (2026-05-31).*  
*Source of truth: this file + the SQL scripts under [scripts/supabase/](scripts/supabase/).*  
*If a table is missing here, file an issue and update both in the same PR.*
