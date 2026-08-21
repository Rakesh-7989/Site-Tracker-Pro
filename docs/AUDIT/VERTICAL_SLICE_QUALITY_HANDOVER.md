# SiteTrack Pro — Vertical Slice Audit: Quality, Inspections, Lab Tests, NCR, Punch List & Handover

> **Authority Document:** Comprehensive end-to-end trace of **Quality Architecture (Quality Plan ➔ Trade Checklists) ➔ Lab Testing & Concrete Cube Strength ➔ End-to-End Material Traceability (PO ➔ GRN ➔ Lot ➔ Pour ➔ Cube) ➔ Non-Conformance Reports (NCR) & CAPA Engine ➔ Quality Gates & Server-Authoritative Hold Points ➔ Punch List Lifecycle ➔ 7-Gate Handover Readiness Engine ➔ Cost of Quality (Rework & Defect Ledger) ➔ Defects Liability Period (DLP) & 5-Year Warranty Mapping ➔ Multi-Domain Evidence Graph**.

---

## 1. Quality, Inspections, NCR & Handover Findings Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `QA-001` | Domain Model | 🔴 **P1** | **Inspections Conflated with Generic Isolated Pass/Fail Records**<br>Inspections exist in isolation without binding to Work Packages, WBS, Activity, and Trade Checklists. | First-class Quality Plan & Inspection domain: `Work Package ➔ Quality Plan ➔ Inspection ➔ Checklists`. | ✅ Architected |
| `QA-002` | Checklist Engine | 🔴 **P1** | **Checklist Decisions Modeled as Free-Text Comments Rather Than Structured Items**<br>Hardcoded checkbox strings in UI components without reusable trade templates and measured parameters. | Reusable `quality_templates` and itemized `inspection_results` across Architecture, Civil & MEP. | ✅ Architected |
| `QA-003` | Lab Testing | 🔴 **P1** | **Material & Concrete Cube Testing Stored as Flat Strings**<br>Concrete strength (7-day / 28-day) and compaction tests lack parameter bounds, samples, and certificate tracking. | Structured `test_requests ➔ test_samples ➔ test_results ➔ test_certificates` pipeline. | ✅ Architected |
| `QA-004` | Material Traceability | 🔴 **P1** | **Disconnected Quality Test Failures ➔ Material Batches & Pour Locations**<br>Failed lab tests cannot automatically identify affected structural pours, suppliers, or material lots. | End-to-end Material Traceability: `PO ➔ GRN ➔ Lot ➔ Pour Location ➔ Cube Sample ➔ Test Result`. | ✅ Architected |
| `QA-005` | Non-Conformance | 🔴 **P1** | **NCR Modeled as Simple Inspection Status Mutation**<br>Non-conformance reports overwrite failure findings without maintaining immutable root causes. | Immutable `ncrs`, `ncr_actions`, `ncr_evidence`, and `ncr_verifications` domain. | ✅ Architected |
| `QA-006` | Continuous Improvement | 🔴 **P1** | **Missing Root Cause Analysis (RCA) and CAPA Workflow**<br>Defect fixes lack structured Immediate, Root, and Contributing Cause analysis with Preventive Action gates. | CAPA Engine (Corrective And Preventive Action) with owner, SLA, and verification evidence. | ✅ Standardized |
| `QA-007` | Quality Hold Points | 🔴 **P1** | **Quality Hold Points Enforced Only in Frontend UI Rather Than Backend Invariant**<br>Disabling a button in UI allows API bypass; subsequent construction activities proceed over uninspected rebar. | Server-authoritative Quality Gate & Hold Point blocker (`if active_hold_point: reject(activity_start)`). | ✅ Enforced |
| `QA-008` | Handover Governance | 🔴 **P1** | **Project Handover Allowed Based on 100% Progress Without Quality Closure**<br>Projects marked complete despite open critical NCRs, unresolved punch list items, or missing as-builts. | 7-Gate Handover Readiness Engine: `100% Progress + 0 Critical NCR + 0 Open Punch + Tests + As-Builts`. | ✅ Enforced |
| `QA-009` | Cost of Quality | 🔴 **P1** | **Rework & Defect Rectification Conflated with Planned Execution Cost**<br>Labour and materials consumed on defect repairs are logged as regular job cost without rework tagging. | Cost Ledger Rework Classification: `NORMAL_EXECUTION` vs `REWORK` vs `DEFECT` vs `WASTE`. | ✅ Architected |
| `QA-010` | Post-Handover Warranty | 🔴 **P1** | **Missing Defects Liability Period (DLP) & Warranty Ticket Mapping**<br>Post-handover defect reports are handled outside the system without traceability to original trade contractors. | Defects Liability Ticket Engine with warranty period tracking and original subcontractor attribution. | ✅ Architected |
| `QA-011` | Punch List Domain | 🔴 **P1** | **Punch Lists Conflated with High-Severity Non-Conformance Reports**<br>Cosmetic handover items are mixed with structural non-conformances in the same flat issue tracker. | Dedicated `punch_items` domain with trade allocation, photo evidence, and client verification. | ✅ Standardized |
| `QA-012` | Handover Package | 🔴 **P1** | **As-Built Drawings and O&M Manuals Overwritten Without Revision History**<br>As-built document replacements erase handover milestone revisions. | Versioned `handover_packages` and `handover_documents` with immutable approved baselines. | ✅ Architected |
| `QA-013` | Quality Audit Trail | 🔴 **P1** | **Quality Signoffs and Inspection Transitions Lack Cryptographic Audit**<br>Status updates (`ACTION_SUBMITTED ➔ VERIFIED`) lack tamper-evident who/when/evidence audit logging. | Mandatory Audit Event capture for all inspection results, hold point releases, and NCR closures. | ✅ Architected |
| `QA-014` | Cross-Domain Evidence | 🔴 **P1** | **Dispute Resolution Lacks Multi-Domain Quality Evidence Graph**<br>Commercial delay claims cannot be correlated with quality NCRs to prove contractor vs owner liability. | Unified Evidence Graph linking `NCR ➔ Inspection ➔ Material Lot ➔ Subcontractor ➔ Delay ➔ Claim`. | ✅ Architected |
| `QA-015` | Productivity Normalization | 🟠 **P2** | **Labor Productivity Distorted by Unclassified Rework Hours**<br>Hours spent rectifying defects degrade calculated crew productivity index without explanatory context. | Labor Productivity Engine separating productive hours from defect rework hours. | ✅ Architected |
| `QA-016` | Trade Templates | 🟠 **P2** | **Uniform Checklist Assumption Ignoring Architecture, Civil & MEP Trade Differences**<br>Single flat checklist format does not fit MEP pressure testing, interior joinery, or structural formwork. | Trade-specific Quality Taxonomy spanning Civil, MEP, Interior Architecture & Consultancy. | ✅ Architected |
| `QA-017` | NCR SLA Governance | 🟠 **P2** | **Missing Automated NCR SLA Escalation for Critical Structural Defects**<br>Critical structural non-conformances sit unattended without automated project manager / director escalation. | Severity-driven SLA engine (Critical 24h, Major 3d, Minor 7d) with automated risk event emission. | ✅ Architected |
| `QA-018` | Witness Points | 🟠 **P2** | **Hold Points and Witness Points Treated Identically**<br>System forces hard stops on witness inspections where work could safely continue under notification rules. | Inspection Gate Classification: `HOLD_POINT` (hard stop) vs `WITNESS_POINT` vs `OBSERVATION`. | ✅ Standardized |
| `QA-019` | Commercial Backcharge | 🔴 **P1** | **Defect Rectification Costs Not Automatically Routed to Subcontractor Backcharge**<br>When general contractor rectifies subcontractor defect, cost is absorbed rather than debited from RA bill. | Defect Rectification ➔ Subcontractor Backcharge pipeline with automated debit note generation. | ✅ Architected |
| `QA-020` | Client Handover Signoff | 🔴 **P1** | **Client Acceptance Bypasses Structured Inspection & Comment Rectification**<br>Binary client signoff without multi-round inspection comments, punch item verification, and partial acceptance. | Multi-Round Client Handover Workflow: `Internal Ready ➔ Client Review ➔ Rectify ➔ Final Signoff`. | ✅ Architected |

---

## 2. Complete Quality, Testing, NCR & Handover Lifecycle Architecture

```text
                           WORK PACKAGE EXECUTION
                                    │
                                    ▼
                              QUALITY PLAN
                        (ITP - Inspection Test Plan)
                                    │
                  ┌─────────────────┴─────────────────┐
                  ↓                                   ↓
             INSPECTION                           LAB TEST
          (Trade Checklist)                  (Cube, Compaction)
                  │                                   │
                  └─────────────────┬─────────────────┘
                                    │
                                    ▼
                              RESULT GATE
                                    │
                  ┌─────────────────┴─────────────────┐
                  ↓                                   ↓
                PASS                                FAIL
                  │                                   │
                  ▼                                   ▼
            HOLD POINT PASS                          NCR
           (Release Next Task)           (Non-Conformance Report)
                  │                                   │
                  │                                   ▼
                  │                                  RCA
                  │                         (Root Cause Analysis)
                  │                                   │
                  │                                   ▼
                  │                                 CAPA
                  │                    (Corrective & Preventive Action)
                  │                                   │
                  │                                   ▼
                  │                              REINSPECTION
                  │                                   │
                  │                                   ▼
                  │                           VERIFIED & CLOSED
                  │                                   │
                  └─────────────────┬─────────────────┘
                                    │
                                    ▼
                               PUNCH LIST
                        (Pre-Handover Snagging)
                                    │
                                    ▼
                         7-GATE HANDOVER ENGINE
                  (Progress, Punch, NCRs, Tests, Docs)
                                    │
                                    ▼
                             FINAL HANDOVER
                                    │
                  ┌─────────────────┴─────────────────┐
                  ↓                                   ↓
       DEFECTS LIABILITY (DLP)                WARRANTY MAPPING
          (Ticket Resolution)               (5-Year Waterproofing/MEP)
```

---

## 3. Database Schema Models: Quality, Testing, NCR & Handover

### `quality_inspections` and `inspection_results`
```sql
CREATE TABLE quality_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    wbs_node_id UUID NOT NULL,
    activity_id UUID NOT NULL,
    location_id UUID NOT NULL,
    
    inspection_type TEXT NOT NULL CHECK (inspection_type IN ('PRE_POUR', 'POST_POUR', 'WATERPROOFING_FLOOD', 'MEP_CONCEALMENT', 'MASONRY_PLASTER', 'FINISHES_SNAG', 'STRUCTURAL_STEEL')),
    gate_type TEXT NOT NULL DEFAULT 'HOLD_POINT' CHECK (gate_type IN ('HOLD_POINT', 'WITNESS_POINT', 'OBSERVATION')),
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('DRAFT', 'REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CANCELLED')),
    
    requested_by UUID NOT NULL,
    inspector_id UUID,
    scheduled_at TIMESTAMPTZ,
    inspected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE inspection_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES quality_inspections(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    description TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'NA')),
    measured_value TEXT,
    comment TEXT,
    evidence_url TEXT
);
```

### `ncrs` & `ncr_actions` (Non-Conformance & CAPA)
```sql
CREATE TABLE ncrs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    wbs_node_id UUID NOT NULL,
    activity_id UUID NOT NULL,
    inspection_id UUID REFERENCES quality_inspections(id),
    
    ncr_number TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'RCA_SUBMITTED', 'ACTION_IN_PROGRESS', 'ACTION_COMPLETED', 'REINSPECTED', 'VERIFIED_CLOSED', 'REOPENED')),
    
    defect_description TEXT NOT NULL,
    root_cause TEXT,
    contributing_cause TEXT,
    
    responsible_contractor_id UUID,
    is_rework_cost_backchargeable BOOLEAN NOT NULL DEFAULT false,
    estimated_rework_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
    
    target_resolution_date DATE NOT NULL,
    resolved_at TIMESTAMPTZ,
    verified_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

### `handover_packages` and `defect_tickets` (DLP & Warranty)
```sql
CREATE TABLE handover_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'INTERNAL_READY', 'CLIENT_REVIEW', 'CLIENT_RECTIFY', 'CLIENT_ACCEPTED', 'HANDED_OVER')),
    
    construction_progress_percent NUMERIC(5, 2) NOT NULL,
    open_critical_ncrs_count INTEGER NOT NULL DEFAULT 0,
    open_punch_items_count INTEGER NOT NULL DEFAULT 0,
    
    dlp_start_date DATE,
    dlp_end_date DATE,
    warranty_months INTEGER NOT NULL DEFAULT 12,
    
    client_signoff_by TEXT,
    signed_off_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE defect_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    handover_id UUID NOT NULL REFERENCES handover_packages(id),
    
    ticket_number TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY')),
    status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RECTIFIED', 'VERIFIED', 'CLOSED')),
    
    original_contractor_id UUID,
    original_work_package_id UUID,
    is_warranty_covered BOOLEAN NOT NULL DEFAULT true,
    
    rectified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 4. Multi-Domain Evidence Graph Architecture

```text
                                 DISPUTE / CLAIM / AUDIT
                                            │
                                            ▼
                                  UNIFIED EVIDENCE GRAPH
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ↓                            ↓                            ↓
         QUALITY EVIDENCE            SCHEDULE EVIDENCE           COMMERCIAL EVIDENCE
         • Inspection-102            • Delay-Event-09            • Subcontract-SC-14
         • Lab Test (Cube-082)       • RFI-0082 Delay            • RA Bill Deductions
         • Photo Evidence (883)      • Activity A-203 Slippage   • Backcharge Debit Note
         • Material Lot #55          • Zero Float Consumption    • Claim CLM-0021
```
