# SiteTrack Pro VNext — Deep-Dive Master Architecture & Implementation Plan

> **Authority Document:** Consolidates the architectural DNA of top 10 global construction & AEC platforms (Procore, Autodesk Construction Cloud, Oracle Aconex, Fieldwire, PlanRadar, Dalux, Trimble Field View, Raken, Buildots, HCSS) tailored for SiteTrack Pro's modular multi-tenant architecture.

---

## 0. Executive Architecture Decision

SiteTrack Pro VNext is built as a **Modular Monolith** powered by a single **Core OS** with specialized **Domain & Industry Modules**:

```text
                           ┌──────────────────────────────┐
                           │      USERS & CLIENTS         │
                           │  Web SPA · Mobile PWA · App  │
                           └──────────────┬───────────────┘
                                          │
                                          ▼
                           ┌──────────────────────────────┐
                           │      IDENTITY & IAM          │
                           │  Auth · Tenant RLS · RBAC    │
                           └──────────────┬───────────────┘
                                          │
                                          ▼
                        ┌────────────────────────────────────┐
                        │          APPLICATION CORE          │
                        │ Org · Users · Projects · Clients   │
                        │ Documents · Finance · CDE          │
                        └─────────────────┬──────────────────┘
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          ▼                               ▼                               ▼
┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
│  FIELD PLATFORM   │           │  INDUSTRY ENGINE  │           │   DATA PLATFORM   │
│ DPR · Tasks       │           │ 1. Construction   │           │ Search            │
│ Forms · Issues    │           │ 2. Architecture   │           │ Analytics         │
│ Labour · Material │           │ 3. Interior       │           │ Risk Signals      │
│ Spatial Hierarchy │           │ 4. Consultancy    │           │ Daily Snapshots   │
└─────────┬─────────┘           └─────────┬─────────┘           └─────────┬─────────┘
          │                               │                               │
          └───────────────────────────────┼───────────────────────────────┘
                                          ▼
                                ┌───────────────────┐
                                │     EVENT BUS     │
                                │   Event Outbox    │
                                └─────────┬─────────┘
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          ▼                               ▼                               ▼
┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
│   NOTIFICATIONS   │           │     AUDIT LOG     │           │   INTEGRATIONS    │
│ In-App · Push     │           │ Immutable Hash    │           │ WhatsApp · Email  │
│ WhatsApp · Email  │           │ Blockchain Anchor │           │ ERP · Webhooks    │
└───────────────────┘           └───────────────────┘           └───────────────────┘
                                          │
                                          ▼
                                ┌───────────────────┐
                                │     AI LAYER      │
                                │ Assistant · RAG   │
                                │ Risk Prediction   │
                                │ Progress / Vision │
                                └───────────────────┘
```

---

## 1. Competitor DNA Matrix & Architectural Insights

| Competitor | Core Architectural Strength | SiteTrack Pro VNext Integration |
|---|---|---|
| **Procore** | Construction OS + App Marketplace + Open APIs | Platform Core + Plugin/Integration Architecture |
| **Autodesk (ACC)** | BIM / Data Interoperability & 2D/3D Sheet Control | CAD/BIM Revision Chain & Sheet Coordinates |
| **Oracle Aconex** | Common Data Environment (CDE) & Strict Transmittals | Document Control, Revision Stacks, Audit Trails |
| **Fieldwire** | Spatial Hierarchy (Plan ➔ Location ➔ Task ➔ Form) | Spatial Model (`Site ➔ Building ➔ Floor ➔ Room ➔ Task`) |
| **PlanRadar** | Ticket/Issue Engine + Custom Form Layers + Webhooks | Declarative State Machine & Dynamic Issue Lifecycle |
| **Dalux** | BIM + Field Reality Capture + Handover Packets | Spatial 3D Mapping & Digital Handover Packets |
| **Trimble Field View** | Robust Offline-First Field Capture & Sync | IndexedDB Local Queue with Optimistic Sync & Conflicts |
| **Raken** | Frictionless Daily Progress Reporting (DPR) | Fast DPR Workflow + Weather, Labour & Photo Evidence |
| **Buildots** | Computer Vision + BIM Reality vs. Planned Progress | EVM Linkage (`DPR ➔ BOQ ➔ % Done ➔ Earned Value ➔ Forecast`) |
| **HCSS HeavyJob** | Field Operations to Job Costing & ERP Integration | PO ➔ GRN ➔ 3-Way Matching ➔ Financial Ledger |

---

## 2. Multi-Tenant Organization & Scope-Aware Identity

### 2.1 Multi-Tenant Isolation
- Every database row and query strictly enforces `organization_id`.
- Tenant-level RLS policies reject cross-organization reads or writes unconditionally.

### 2.2 Scope-Aware RBAC Model
Permissions are not evaluated as a simple role string (`role = "manager"`). Instead, authorization decisions are composed of:
$$\text{Decision} = f(\text{Subject}, \text{Organization}, \text{Project}, \text{Resource Scope}, \text{Action})$$

```text
Identity Role (Platform level)
   ├── Organization Role (Tenant level: Owner, Admin, PM, Member, Guest)
   └── Project Role (Site Manager, Resident Engineer, Quality Inspector, Contractor)
```

---

## 3. Spatial Hierarchy & Field Operations

### 3.1 Spatial Model
Field activities attach to physical space rather than abstract folders:
```text
Project 
  └── Site 
        └── Building 
              └── Floor 
                    └── Zone 
                          └── Room / Unit
                                ├── Drawings / Sheets
                                ├── Tasks & Milestones
                                ├── DPR Entries
                                ├── Issues & Snagging
                                ├── Material Requests & GRN
                                └── Quality Inspections
```

### 3.2 Field Ops Simplicity (Raken + Fieldwire Paradigm)
Site supervisors access quick-action cards for high-frequency workflows:
1. **Daily Log (DPR)**: Labour counts, equipment utilization, work progress against BOQ.
2. **Issue Capture**: Fast photo attachment, pin location, assign contractor with SLA.
3. **Inspection Checklist**: Pre-pour, rebar, waterproofing, MEP checks with sign-off signatures.

---

## 4. Offline-First Engine & Conflict Resolution

```text
+-------------------------------------------------------+
|                       CLIENT                          |
|  +--------------------+       +--------------------+  |
|  |     UI Layer       | <---> |  IndexedDB Cache   |  |
|  +--------------------+       +--------------------+  |
|            |                            ^             |
|            v                            |             |
|  +--------------------+                 |             |
|  | Sync Outbox Queue  | ----------------+             |
|  +--------------------+                               |
+------------|------------------------------------------+
             | (When Online)
             v
+-------------------------------------------------------+
|                       SERVER                          |
|  +--------------------+       +--------------------+  |
|  | REST / RPC Gateway | ----> | PostgreSQL + RLS   |  |
|  +--------------------+       +--------------------+  |
|            |                                          |
|            v                                          |
|  +--------------------+                               |
|  | Conflict Evaluator | (Version & Timestamp Guard)   |
|  +--------------------+                               |
+-------------------------------------------------------+
```

- **Sync Queue Fields**: `queue_id`, `entity_type`, `entity_id`, `action`, `payload`, `created_at`, `retry_count`, `status`.
- **Conflict Strategy**: Last-Write-Wins for non-critical fields; Version-Increment checks & Audit flags for critical financial/approval records.

---

## 5. CDE, Drawing Revisions & Transmittal Lifecycle

- **Revision Retention**: Prior drawing revisions (`Rev A`, `Rev B`, `Rev C`) remain immutable.
- **Historical Association**: Tasks and issues created on `Rev A` retain their coordinates on `Rev A` while showing a banner if a newer revision (`Rev C`) has superseded it.
- **Document Status Ladder**:
  $$\text{Draft} \longrightarrow \text{Internal Review} \longrightarrow \text{Client Review} \longrightarrow \text{Approved} \longrightarrow \text{Published} \longrightarrow \text{Superseded} \longrightarrow \text{Archived}$$

---

## 6. Commercial Operations & Earned Value Management (EVM)

```text
DPR Daily Output ───► Cumulative Qty ───► BOQ Unit Rate ───► Earned Value (EV)
                                                                    │
Actual Cost (AC) ◄─── Invoices ◄─── GRN ◄─── PO ◄─── PR ────────────┼───► Cost Variance (CV = EV - AC)
                                                                    │
Planned Value (PV) ◄─── Baseline Schedule ──────────────────────────┴───► Schedule Variance (SV = EV - PV)
```

---

## 7. Four Industry Editions Architecture

1. **🏗️ Construction Edition**:
   - Focus: Site Execution, DPR, Labour Headcounts, BOQ Tracking, Subcontractor RA Bills, Safety, Inspections & RERA Compliance.
2. **📐 Architecture Edition**:
   - Focus: Milestone Phase Engine, Hourly/Lump-Sum Fee Plans, Consultant Coordination, Drawing Review Register, Design Decisions & Client Approvals.
3. **🛋️ Interior Design Edition**:
   - Focus: Room/Zone Spatial Hierarchy, FF&E Schedules, Moodboards, Selection to PO Chains, Delivery/Installation Tracking & Margin Analytics.
4. **💼 Consultancy Edition**:
   - Focus: Engagements & Scopes, Staff Utilization & Time Tracking, Dynamic Audit Checklists, Corrective & Preventive Action (CAPA), Executive Reports & Retainer Billing.

---

## 8. Phased Implementation Roadmap

- **Phase 0 — Baseline & Production Hardening**: RLS enforcement, DB schema audit, CI/CD pipeline, multi-tenant isolation verification.
- **Phase 1 — Shared Core Engines**: Declarative Workflow Engine, Dynamic Form Engine, Event Outbox Bus, Spatial Location Tree.
- **Phase 2 — Field Operations & CDE**: Offline-first DPR, Task hierarchy, Drawing comparison (`DiffView`, `CadPreviewModal`), Transmittals.
- **Phase 3 — Commercial & EVM**: BOQ Import, Budget Change Orders, 3-Way Matching (`PO ➔ GRN ➔ Invoice`), P&L / WIP Aging calculations.
- **Phase 4 — Industry Specifics**: Architecture Phase engine, Interior FF&E matrix, Consultancy Dynamic Audit builder.
- **Phase 5 — Event Platform & Integrations**: Webhook handlers, WhatsApp notifications, External REST API endpoints.
- **Phase 6 — Analytics & AI Intelligence**: Risk Signals computation, Delay predictions, RAG assistant with strict tenant filtering.
