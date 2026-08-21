# SiteTrack Pro VNext — User Story Mapping & Autonomous Agentic Looping Plan

> **Executive Overview:** Direct translation of the 50-point Master Blueprint and 10-Competitor DNA Analysis into actionable User/Client Stories organized by Industry Segment, executed through a rigorous 5-step Agentic Looping Pattern (**Deep-Dive ➔ Plan ➔ Build ➔ Verify ➔ Auto-Progress**).

---

## Part 1: Persona & Founder Mindset Alignment

### 🎯 The Founder / Enterprise Mindset
1. **Zero-Slop, High-Utility Architecture:** Every screen, query, and state transition exists to solve a real field or enterprise problem.
2. **Single Multi-Tenant Core with 4 Industry Engines:** No fractured multi-repo complexity. A unified Core OS powers Construction, Architecture, Interior Design, and Consultancy.
3. **Strict Tenancy & Scope-Aware RBAC:** No cross-tenant data leakage. Permissions evaluate $(Subject + Org + Project + Resource + Action)$.
4. **Offline-First Resilience:** Field engineers in low-connectivity sites capture data reliably into IndexedDB with background optimistic sync.
5. **Continuous Verification:** Every change must compile cleanly with 0 TypeScript errors and 0 lint failures.

---

## Part 2: Segment-by-Segment User & Client Story Matrix

### 🏢 1. Core Platform & Tenant Layer (Shared OS)
- **US-CORE-01 (Multi-Tenant Org Workspace):** As an **Enterprise Owner**, I want complete data isolation for my organization so that my projects, staff, documents, and financials are private and protected by database-level RLS.
- **US-CORE-02 (Scope-Aware Access Control):** As an **Org Admin**, I want to assign role capabilities at the platform, organization, and project levels so that a Project Manager only has edit rights within their assigned projects.
- **US-CORE-03 (Immutable Audit Trail):** As a **Compliance Officer**, I want every create, update, delete, and approval action cryptographically recorded with actor ID, timestamp, entity diff, and client metadata.

---

### 📍 2. Spatial Hierarchy & Field Platform
- **US-FIELD-01 (Physical Space Hierarchy):** As a **Site Engineer**, I want to navigate and tag work items by `Site ➔ Building ➔ Floor ➔ Zone ➔ Room` so that issues, tasks, and drawings are anchored to physical locations.
- **US-FIELD-02 (Offline Daily Progress Reporting - DPR):** As a **Site Supervisor**, I want to log labour headcounts, equipment usage, weather conditions, and work progress against BOQ items offline, auto-syncing when back in range.
- **US-FIELD-03 (Dynamic Issue Tracking):** As a **Quality Inspector**, I want to capture defect photos, pin them to sheet coordinates, set severity and assign contractor SLAs with automated push/WhatsApp notifications.

---

### 🏗️ 3. Construction Industry Edition
- **US-CONST-01 (BOQ & Milestone Tracking):** As a **Construction PM**, I want to track physical progress against bill of quantities (BOQ) line items to compute Earned Value (EV).
- **US-CONST-02 (Labour & Shift Roster):** As a **Timekeeper**, I want daily biometric/geo-tagged attendance and shift roster tracking to measure labour productivity.
- **US-CONST-03 (Subcontractor RA Billing & 3-Way Matching):** As a **Billing Engineer**, I want to verify Contractor Running Account (RA) bills against goods receipts (GRN) and purchase orders before payment approvals.

---

### 📐 4. Architecture Industry Edition
- **US-ARCH-01 (Fee Phasing & Milestone Billing):** As a **Principal Architect**, I want structured fee phases (Schematic Design, DD, CD, GFC, Handover) with fee-budget consumption and percentage-based billing.
- **US-ARCH-02 (Consultant Drawing Coordination):** As a **Design Coordinator**, I want to track structural, MEP, and landscape submittals with drawing revision registers (`Rev A ➔ Rev B ➔ GFC`).
- **US-ARCH-03 (CAD/BIM Visual Comparison & Annotations):** As an **Architect**, I want to visually diff DXF/DWG revisions side-by-side and place pin-comments for client reviews.

---

### 🛋️ 5. Interior Design Industry Edition
- **US-INT-01 (Spatial FF&E Schedule):** As an **Interior Designer**, I want room-by-room Furniture, Fixtures & Equipment (FF&E) schedules with finish specs, vendor quotes, and budget caps.
- **US-INT-02 (Client Moodboards & Visual Selection):** As a **Design Consultant**, I want interactive moodboards where clients can approve or request revisions on material finishes and furnishings.
- **US-INT-03 (Installation & Snagging):** As an **Interior Project Manager**, I want delivery tracking and room-wise snagging checklists before client handover.

---

### 💼 6. Consultancy Industry Edition
- **US-CONS-01 (Scope & Engagement Lifecycle):** As a **Lead Consultant**, I want structured scope definitions, change request approvals, and milestone deliverables.
- **US-CONS-02 (Billable Timesheets & Staff Utilization):** As an **Operations Manager**, I want team time tracking against project deliverables to monitor billing efficiency and resource burnout.
- **US-CONS-03 (Dynamic Site Audits & CAPA Engine):** As a **Safety/Quality Auditor**, I want customizable audit templates with automated Non-Conformance Reports (NCR) and Corrective Action workflows.

---

### 📊 7. Commercial, CDE & AI Intelligence Layer
- **US-COMM-01 (Document CDE & Transmittal Ladder):** As a **Project Director**, I want a formal Document State Ladder (`Draft ➔ Review ➔ Approved ➔ Published ➔ Superseded ➔ Archived`).
- **US-COMM-02 (Project P&L & WIP Aging):** As a **Finance Director**, I want real-time Project Profit & Loss and Work-in-Progress (WIP) aging dashboards.
- **US-AI-01 (Predictive Risk Engine):** As a **Project Manager**, I want deterministic risk signals analyzing schedule variance, labour deficits, and delayed approvals to predict project delays before they happen.

---

## Part 3: Autonomous Agentic Looping Implementation Pattern

```text
       ┌───────────────────────────────────────────────────────────┐
       │             AUTONOMOUS AGENTIC LOOP CYCLE                 │
       └─────────────────────────────┬─────────────────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │          1. DEEP DIVE                 │
                 │ Examine scope, DB schemas, queries,  │
                 │ state boundaries & edge cases         │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │             2. PLAN                   │
                 │ Draft concrete interfaces, query APIs,│
                 │ and component integration points      │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │             3. BUILD                  │
                 │ Implement TS queries, domain helpers, │
                 │ and UI components surgically          │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │            4. VERIFY                  │
                 │ Run Typecheck, Lint, Build & Gateways;│
                 │ fix any regressions immediately       │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │        5. AUTO-PROGRESS               │
                 │ Mark sub-task completed, update state,│
                 │ proceed automatically to next task    │
                 └───────────────────────────────────────┘
```

---

## Part 4: Phased Execution Matrix & Current Status

| Phase | Domain Focus | Key Deliverables | Status |
|---|---|---|---|
| **Phase 0** | Baseline & Security | Multi-tenant RLS, Quota TOCTOU protection, zero-drift domain boundaries | ✅ Complete & Verified |
| **Phase 1** | Shared Core Engines | Workflow Engine, Form Engine, Event Outbox (`eventOutbox.ts`), Spatial Context | ✅ Complete & Verified |
| **Phase 2** | Construction & Field Ops | DPR, Labour & Attendance, Materials Ledger, Subcontractors, BOQ, Safety, QA | ✅ Complete & Verified |
| **Phase 3** | Architecture Engine | Phase Engine, Fee Plans, Consultant Submittals, Drawing Review, CAD Preview | ✅ Complete & Verified |
| **Phase 4** | Interior Design Engine | Room Hierarchy, FF&E Schedules, Moodboards, PO 3-Way Match, Snagging | ✅ Complete & Verified |
| **Phase 5** | Consultancy Engine | Engagements, Staff Timesheets, Utilization, Dynamic Audits, CAPA, Reports | ✅ Complete & Verified |
| **Phase 6** | Commercial & CDE | RA Bills, Budget Change Orders, Project P&L, WIP Aging, CDE Revision Ladder | ✅ Complete & Verified |
| **Phase 7** | Analytics & AI Intelligence | Risk Signals Engine, Delay Prediction, Multi-tenant RAG Gateway | ✅ Complete & Verified |
| **Phase 8** | Production Verification | ESLint 0 errors, TypeScript 0 errors, Vite Production Build, Health Check | ✅ Live & Stable |
