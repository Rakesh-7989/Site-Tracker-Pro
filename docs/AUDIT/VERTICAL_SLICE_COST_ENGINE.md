# SiteTrack Pro — Vertical Slice Audit: Material Issue, Consumption & Cost Control Architecture

> **Authority Document:** Comprehensive end-to-end trace of **Material Issues (`material_issues`, `material_issue_items`) ➔ Available Stock Reservation ➔ Append-Only Cost & Inventory Ledgers ➔ Work Package & BOQ Linkage ➔ Multi-Tier Cost Stages (Budget vs Committed vs Incurred vs Actual) ➔ Measurement Book Physical vs Financial Drift ➔ Quantity-Rate EAC Forecasting ➔ Unified Domain Event Cost Engine**.

---

## 1. Material Issue & Project Cost Findings Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `COST-001` | Cost Recognition | 🔴 **P1** | **Inventory Receipt Conflated with Project Actual Consumption**<br>System assumes received inventory (`GRN`) equals job cost rather than actual site material issues. | Material Issue domain separating stored inventory from consumed work package cost. | ✅ Architected |
| `COST-002` | Stock Reservation | 🔴 **P1** | **Material Issue Lacks Pre-Issue Available Stock Reservation**<br>Competing site crews can issue same physical stock without `available = on_hand - reserved` guard. | Real-time stock reservation engine checking unreserved stock before approval. | ✅ Enforced |
| `COST-003` | Financial Ledger | 🔴 **P1** | **Material Issues Not Backed by Append-Only Cost Ledger**<br>Uncontrolled mutation on consumption records without immutable compensating transactions. | Append-only `cost_transactions` and `inventory_ledger` audit trail. | ✅ Architected |
| `COST-004` | Financial Spine | 🔴 **P1** | **Material Consumption Lacks Granular BOQ / WBS / Cost Code Linkage**<br>Material consumption logs flat strings without tagging to `work_package_id`, `boq_item_id`, `cost_code_id`. | First-class BOQ and WBS cost hierarchy binding consumption to planned budget. | ✅ Standardized |
| `COST-005` | Financial Hierarchy | 🔴 **P1** | **Conflation of Budget vs Committed vs Incurred vs Actual Costs**<br>Single flat cost metric without clear lifecycle stages (Original Budget ➔ Approved Changes ➔ PO Commitments ➔ GRN Incurred ➔ Invoice Actuals). | Multi-tier Cost Hierarchy separating Budget, Commitments, Incurred, and Actuals. | ✅ Architected |
| `COST-006` | Forecasting Model | 🔴 **P1** | **Simplistic Percentage-Based Cost Forecasting Lacking Work Breakdown**<br>Forecasts generated via arbitrary linear percentage multiplier instead of quantity-rate cost code EAC. | Cost-code-level Forecast to Complete (`ETC = Remaining Qty × Forecast Rate`) and EAC. | ✅ Architected |
| `COST-007` | Budget Governance | 🔴 **P1** | **Missing Budget Snapshots & Historical Baselines**<br>In-place updates to project budget overwrite baseline history without tracking changes over time. | `budget_versions` snapshot history for variance and drift auditability. | ✅ Architected |
| `COST-008` | Commercial Governance | 🔴 **P1** | **Draft Change Orders Prematurely Modifying Approved Budget**<br>Change requests adjust budget before formal client/commercial approval. | Strict state gate: only `APPROVED` Change Orders revise the project baseline budget. | ✅ Enforced |
| `COST-009` | Cost Commitments | 🔴 **P1** | **Missing Event-Driven PO ➔ Cost Commitment Posting**<br>PO approval does not automatically reserve committed cost against budget line items. | Domain event `PO_APPROVED ➔ +COMMITTED_COST` reservation trigger. | ✅ Architected |
| `COST-010` | Incurred Cost Engine | 🔴 **P1** | **Missing GRN ➔ Incurred Cost Accrual Pipeline**<br>Received materials not recognized as incurred liability prior to invoice generation. | Event-driven `GRN_POSTED ➔ +INCURRED_LIABILITY` accrual bridge. | ✅ Architected |
| `COST-011` | Invoicing Integration | 🔴 **P1** | **Invoice Acceptance Directly Modifying Cost Without 3-Way Match Verification**<br>Unverified vendor bills posted directly to project actual cost without GRN/PO reconciliation. | Actual cost recognition strictly conditional on 3-way match validation. | ✅ Enforced |
| `COST-012` | Cost Allocation | 🔴 **P1** | **Material Consumption Not Attributed to Specific Work Packages**<br>General site consumption without task/element level cost allocation prevents accurate gross margin analysis. | Element/Task-level cost allocation engine (`Work Package ➔ Task ➔ Actual Cost`). | ✅ Architected |
| `COST-013` | Project Controls | 🔴 **P1** | **Missing Physical vs Financial Progress Drift Analysis**<br>System cannot compare Measurement Book executed % with material/cost consumption %. | Real-time Physical vs Financial Progress twin detecting consumption overruns early. | ✅ Architected |
| `COST-014` | Anomaly Detection | 🟠 **P2** | **No Automated Cost & Material Consumption Anomaly Alerts**<br>Material consumption exceeding physical progress by >15% goes undetected until post-project audit. | AI/Algorithmic Cost Efficiency Sentinel flagging material wastage and yield drift. | ✅ Architected |
| `COST-015` | Unified Architecture | 🔴 **P1** | **Fragmented Cost Writes Across Isolated Database Tables**<br>Individual modules (PO, GRN, Bill, CO) independently write to finance tables without unified domain event bus. | Unified `Domain Event ➔ Cost Posting Engine ➔ Cost Ledger` architecture. | ✅ Architected |

---

## 2. The Complete Material Issue to Forecast Cost Lifecycle

```text
                     PROJECT DIGITAL TWIN
                               │
            ┌──────────────────┴──────────────────┐
            ↓                                     ↓
      PHYSICAL TWIN                         FINANCIAL TWIN
      (BOQ Qty, MB Progress)                (Budget, Commitments, Actuals)
            │                                     │
            ▼                                     ▼
     MATERIAL REQUEST                      ORIGINAL BUDGET
            │                                     │
            ▼                                     ▼
      PURCHASE ORDER                       APPROVED VARIATION (CO)
            │                                     │
            ▼                                     ▼
        GRN (Delivery)                     REVISED BUDGET
            │                                     │
            ▼                                     ▼
     INVENTORY ON-HAND                     COMMITTED COST (PO Approved)
            │                                     │
            ▼                                     ▼
     MATERIAL ISSUE                        INCURRED LIABILITY (GRN Received)
   (Stock Reservation)                            │
            │                                     ▼
            ▼                              ACTUAL COST (3-Way Invoiced/Paid)
      WORK PACKAGE / TASK                         │
            │                                     ▼
      CONSUMED IN SITE                     COST VARIANCE (Budget - EAC)
            │                                     │
            ▼                                     ▼
     MEASUREMENT BOOK                      FORECAST TO COMPLETE (ETC)
    (Physical Progress %)                         │
            │                                     ▼
            └──────────────────┬──────────────────┘
                               │
                               ▼
                    PHYSICAL VS FINANCIAL
                       DRIFT SENTINEL
               (e.g., 85% Material Consumed
                     vs 68% Executed MB)
```

---

## 3. Database Schema Models: Material Issue & Cost Control

### `material_issues` and `material_issue_items`
```sql
CREATE TABLE material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    location_id UUID NOT NULL,
    work_package_id UUID NOT NULL,
    cost_code_id UUID NOT NULL,
    issue_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REQUESTED', 'APPROVED', 'ISSUED', 'CONSUMED', 'CANCELLED')),
    issued_to_team TEXT NOT NULL,
    purpose TEXT NOT NULL,
    requested_by UUID NOT NULL,
    approved_by UUID,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE material_issue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES material_issues(id) ON DELETE CASCADE,
    material_id UUID NOT NULL,
    boq_item_id UUID NOT NULL,
    quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    unit_rate NUMERIC(14, 4) NOT NULL DEFAULT 0,
    total_cost NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(quantity * unit_rate, 2)) STORED
);
```

### `project_cost_summary` (Authoritative Read Model)
```sql
CREATE TABLE project_cost_summary (
    project_id UUID NOT NULL,
    cost_code_id UUID NOT NULL,
    original_budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
    approved_variations NUMERIC(14, 2) NOT NULL DEFAULT 0,
    revised_budget NUMERIC(14, 2) GENERATED ALWAYS AS (original_budget + approved_variations) STORED,
    
    committed_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
    incurred_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
    actual_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
    
    forecast_to_complete NUMERIC(14, 2) NOT NULL DEFAULT 0,
    estimate_at_completion NUMERIC(14, 2) GENERATED ALWAYS AS (actual_cost + forecast_to_complete) STORED,
    variance NUMERIC(14, 2) GENERATED ALWAYS AS (original_budget + approved_variations - (actual_cost + forecast_to_complete)) STORED,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (project_id, cost_code_id)
);
```

---

## 4. End-to-End Autonomous Agent Looping Execution Roadmap

```text
PHASE 1: Core Financial Procurement & PO Hardening (PO-001 -> PO-015)
  └─ Step 1: Deep dive -> Plan -> Build discrete RLS & Tiered Approval Chains
  └─ Step 2: Test & lint -> Fix regressions -> Verify live build

PHASE 2: Immutable Inventory Ledger & GRN Control (INV-001 -> INV-015)
  └─ Step 1: Deep dive -> Plan -> Build Append-only Ledger & Multi-location balances
  └─ Step 2: Test & lint -> Fix regressions -> Verify live build

PHASE 3: Material Issue, Work Package & Cost Allocation (COST-001 -> COST-015)
  └─ Step 1: Deep dive -> Plan -> Build Material Issue, Stock Reservation & Cost Events
  └─ Step 2: Test & lint -> Fix regressions -> Verify live build

PHASE 4: Physical vs Financial Twin & Forecasting (COST-013 -> COST-015)
  └─ Step 1: Deep dive -> Plan -> Build MB vs Consumption Sentinel & Quantity-Rate EAC
  └─ Step 2: Final End-to-End Regression Suite & Production Verification
```
