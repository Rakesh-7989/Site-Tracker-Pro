# SiteTrack Pro VNext — 3-Industry Architecture & Looping Implementation Plan
## Architecture, Interior Design & Consultancy Editions + Core Shared Engines

> **Authority Reference:** Implements the remaining 3 specialized industry domains (Architecture, Interior Design, Consultancy) integrated with the SiteTrack Core OS, Event Bus, Dynamic Form Engine, and AI Decision Layer via the 5-step Agentic Looping pattern.

---

## Part 1: Four-Industry Master Architecture Alignment

```text
                           ┌──────────────────────────────┐
                           │       SITETRACK CORE OS      │
                           │ Org · RBAC · Projects · CDE  │
                           │  Finance · Event Outbox Bus  │
                           └──────────────┬───────────────┘
                                          │
        ┌───────────────────┬─────────────┴─────────────┬───────────────────┐
        ▼                   ▼                           ▼                   ▼
┌───────────────┐   ┌───────────────┐           ┌───────────────┐   ┌───────────────┐
│ CONSTRUCTION  │   │ ARCHITECTURE  │           │   INTERIOR    │   │  CONSULTANCY  │
│  (Site Ops)   │   │ (Design & CA) │           │ (FF&E & Space)│   │ (Audits/Time) │
├───────────────┤   ├───────────────┤           ├───────────────┤   ├───────────────┤
│ • Daily DPR   │   │ • Phase Engine│           │ • Room Engine │   │ • Engagement  │
│ • Labour Roster│  │ • Fee Splits  │           │ • Moodboards  │   │ • Scope Engine│
│ • BOQ Progress│   │ • Submittals  │           │ • Selections  │   │ • Timesheets  │
│ • Subcon RA   │   │ • Drawing Rev │           │ • Product Lib │   │ • Utilization │
│ • Safety QA   │   │ • Decisions   │           │ • 3-Way Match │   │ • Dynamic QA  │
│ • 3-Way Match │   │ • Transmittals│           │ • Snagging    │   │ • CAPA Engine │
└───────┬───────┘   └───────┬───────┘           └───────┬───────┘   └───────┬───────┘
        │                   │                           │                   │
        └───────────────────┴─────────────┬─────────────┴───────────────────┘
                                          ▼
                                ┌───────────────────┐
                                │     EVENT BUS     │
                                │   Event Outbox    │
                                └─────────┬─────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
│   NOTIFICATIONS   │           │     AUDIT LOG     │           │   AI PLATFORM     │
│ Push · In-App     │           │ Hash Chain Record │           │ RAG · Predictions │
│ WhatsApp · Email  │           │ Blockchain Anchor │           │ Margin · Risk     │
└───────────────────┘           └───────────────────┘           └───────────────────┘
```

---

## Part 2: Industry Deep-Dives & Domain Models

### 📐 1. Architecture Industry Edition (Practice OS + Design Studio)
- **Phase Engine (`phaseQueries.ts`, `PhasesTab.tsx`)**:
  - Structured standard phases: `Brief ➔ Feasibility ➔ Concept ➔ Schematic Design ➔ Design Development ➔ Construction Documents ➔ Tender ➔ Construction Admin ➔ Handover`.
  - Phase budget hours, actual hours, fee percentages, and target delivery milestones.
- **Fee Architecture & Profitability (`rateCardQueries.ts`, `ProjectPnLTab.tsx`)**:
  - Milestone-based fee schedule linked to phases, tracking fee burn rate vs. actual hours spent.
- **Consultant Coordination & Deliverables (`DeliverablesTab.tsx`, `ReviewRoundsTab.tsx`)**:
  - Submittals from structural, MEP, landscape, lighting, and HVAC consultants.
  - Review rounds with versioned drawing markups (`Rev A ➔ Rev B ➔ GFC`).
- **Design Decision Register**:
  - Audit trail of client decisions affecting floor plans, 3D models, and BOQs.

---

### 🛋️ 2. Interior Design Industry Edition (Room + Selection + FF&E OS)
- **Room Engine as 1st-Class Citizen (`RoomsTab.tsx`, `spaceQueries.ts`)**:
  - Space model: `Project ➔ Room (Living, Dining, Master Bed, Kitchen, Bath)`.
- **Selection Engine & Moodboards (`MoodBoardsTab.tsx`, `FfeTab.tsx`, `ffeQueries.ts`)**:
  - Visual concept boards with color palettes, textures, and product specifications.
  - Selection lifecycle: `Proposed ➔ Client Review ➔ Approved ➔ Ordered ➔ Shipped ➔ Received ➔ Installed ➔ Closed`.
- **Procurement & 3-Way Matching (`POsTab.tsx`, `ThreeWayMatchingTab.tsx`)**:
  - Vendor cost vs. designer markup vs. client price with margin analytics.
  - Purchase Orders linked to Goods Receipts (GRN) and Vendor Invoices.
- **Installation & Snagging (`PunchTab.tsx`)**:
  - Room-wise snagging checklist with photo evidence and responsible vendor assignment.

---

### 💼 3. Consultancy Industry Edition (Engagement + Resource + Audit OS)
- **Engagement & Scope Engine (`engagementsQueries.ts`, `scopeQueries.ts`)**:
  - Fixed-fee, time & material, milestone, and monthly retainer billing models.
  - Formal scope definitions with change request impact analysis to eliminate scope creep.
- **Billable Timesheets & Staff Utilization (`TimeTab.tsx`, `timeQueries.ts`, `UtilizationTab.tsx`)**:
  - Employee billable vs. non-billable time tracked against project deliverables.
  - Team utilization rate analytics ($\text{Billable Hours} / \text{Available Hours}$).
- **Dynamic Site Audit & CAPA Engine (`AuditTab.tsx`, `ReportsTab.tsx`, `consultancyAuditQueries.ts`)**:
  - Dynamic checklist engine with conditional questions, photo evidence, and severity scoring.
  - Non-Conformance Reports (NCR) and Corrective & Preventive Action (CAPA) tracking.

---

## Part 3: Autonomous Agentic Looping Implementation Plan

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

## Part 4: Phased Verification Matrix

| Phase | Edition / Engine | Sub-Tasks Completed | Verification Result |
|---|---|---|---|
| **Phase A** | Architecture Edition | Phase Engine, Fee Splits, Consultant Submittals, Drawing Review, CAD Preview | ✅ Verified (0 Errors) |
| **Phase B** | Interior Edition | Room Hierarchy, Moodboards, Selection Engine, FF&E Schedule, Snagging | ✅ Verified (0 Errors) |
| **Phase C** | Consultancy Edition | Engagements, Staff Utilization, Timesheets, Dynamic Audits, CAPA Engine | ✅ Verified (0 Errors) |
| **Phase D** | Shared OS & AI | Event Outbox, Workflow Engine, Spatial Engine, Risk Signals, Multi-Tenant RLS | ✅ Verified (0 Errors) |
