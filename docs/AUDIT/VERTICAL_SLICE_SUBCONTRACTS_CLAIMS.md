# SiteTrack Pro — Vertical Slice Audit: Subcontractors, Contracts, RA Bills & Commercial Claims

> **Authority Document:** Comprehensive end-to-end trace of **Party Taxonomy (Supplier vs Subcontractor vs Consultant) ➔ Authoritative Contracts (`contracts`, `contract_items`) ➔ Contract BOQ & Schedule of Rates ➔ Scope Work Progress & MB Certification ➔ RA Bills & Automated Deductions Engine ➔ Retention Ledger (`retention_ledger`) ➔ Commercial Claims Domain (`claims`, `claim_events`, `claim_documents`) ➔ Variation to Contract Value ➔ Segregation of Duties (SoD) ➔ Commercial Cash-Flow Forecast**.

---

## 1. Subcontracts, Commercial & Claims Findings Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `SUB-001` | Domain Model | 🔴 **P1** | **RA Bills Exist Without Binding to First-Class Subcontract Entity**<br>RA bills exist as isolated records without binding to formal `contracts` and contractor commercial obligations. | First-class `contracts` entity binding subcontractor RA bills to contract items. | ✅ Architected |
| `SUB-002` | Commercial Integrity | 🔴 **P1** | **Direct Mutation of Approved Contract Values**<br>Contract values can be edited directly via generic UPDATE without formal Variation / Change Order. | Approved contract immutability; revisions strictly via approved variations/amendments. | ✅ Enforced |
| `SUB-003` | Work Progress | 🔴 **P1** | **Measurement Book Progress Disconnected from Contract BOQ**<br>Measurements lack contract-scoped BOQ item validation and cumulative quantity limit checks. | Contract-scoped measurement progress with contract BOQ limit tracking. | ✅ Standardized |
| `SUB-004` | Quantity Modeling | 🔴 **P1** | **Conflation of Contracted vs Measured vs Certified vs Billed Quantities**<br>System treats measured work as immediately payable without distinguishing certified and billed quantities. | Explicit 4-tier quantity lifecycle: `Contracted ➔ Measured ➔ Certified ➔ Billed ➔ Paid`. | ✅ Architected |
| `SUB-005` | Financial Engine | 🔴 **P1** | **Client-Authoritative RA Bill Payable Calculations**<br>Net payable amount computed on client side without server-authoritative deductions engine. | Server-side authoritative RA bill calculation (Gross - Retention - Advance - TDS = Net). | ✅ Enforced |
| `SUB-006` | Retention Accounting | 🔴 **P1** | **Retention Modeled as Mutable Flag Rather Than Financial Ledger**<br>Retention released by mutating original bill rows (`retention_amount = 0`) instead of ledger release transactions. | Append-only `retention_ledger` tracking withholdings and defect-liability release events. | ✅ Architected |
| `SUB-007` | Commercial Claims | 🔴 **P1** | **Claims (EOT, Delay, Loss & Expense) Treated as Generic Comments**<br>Subcontractor delay/cost claims lack structured dispute, evidence, and settlement domain models. | First-class `claims`, `claim_items`, `claim_events`, and `claim_documents` domain. | ✅ Architected |
| `SUB-008` | Claim Valuation Gate | 🔴 **P1** | **Claim Value Prematurely Modifying Contract Value Prior to Assessment**<br>Claimed amounts directly adjust commercial obligations before formal QS assessment and signoff. | Multi-stage claim lifecycle: `Submitted ➔ Assessed ➔ Approved ➔ Variation Conversion`. | ✅ Enforced |
| `SUB-009` | Commercial Governance | 🔴 **P1** | **Missing Segregation of Duties (SoD) Across Subcontractor Lifecycle**<br>Single user role can create, certify, approve, and disburse subcontractor payments. | Strict Segregation of Duties: `Contractor Submit != Site Verify != QS Certify != Finance Pay`. | ✅ Architected |
| `SUB-010` | Evidence & Compliance | 🟠 **P2** | **Contract Documents (Bank Guarantees, Insurance) Lack Validity Gates**<br>Unchecked expiry dates on performance guarantees and CAR insurance allow risky disbursements. | Contract compliance engine blocking payments on expired guarantees/insurances. | ✅ Architected |
| `SUB-011` | Financial Planning | 🔴 **P1** | **Missing Commercial Cash-Flow & Liability Forecast Engine**<br>Finance unable to forecast upcoming subcontractor disbursements (Certified Unpaid + Retention + Claims). | Multi-period commercial cash-flow projection based on milestone and RA bill schedules. | ✅ Architected |
| `SUB-012` | Performance Intelligence | 🟠 **P2** | **Subjective Contractor Performance Scoring Lacking Objective Evidence**<br>Contractor rating based on arbitrary reviews rather than schedule, cost, quality NCR, and safety data. | Evidence-backed Subcontractor Performance & Risk Index (Schedule + Cost + NCR + Claims). | ✅ Architected |
| `SUB-013` | Party Taxonomy | 🟠 **P2** | **Conflation of Suppliers, Subcontractors, and Consultants into Generic Vendors**<br>Material suppliers and labor subcontractors share single flat entity despite disparate commercial flows. | Clear Party Taxonomy: `Party ➔ Supplier (PO/GRN) | Subcontractor (Contract/RA) | Consultant`. | ✅ Architected |
| `SUB-014` | Risk & Dispute | 🔴 **P1** | **Disconnected RFI / Drawing Delays ➔ Subcontractor Delay Claims Graph**<br>Delayed engineering responses are not linked to contractor claims for delay analysis. | Claim Evidence Graph: `RFI Delay ➔ Drawing Revision ➔ Schedule Impact ➔ Delay Claim`. | ✅ Architected |
| `SUB-015` | Unified Architecture | 🔴 **P1** | **Commercial Operations Bypassing Central Domain Event & Ledger Pipeline**<br>Subcontract milestones mutate records without generating unified financial and audit events. | Unified Subcontract Event Bus: `Contract Awarded ➔ Work Certified ➔ Retention Held ➔ Paid`. | ✅ Architected |

---

## 2. Complete Subcontractor & Commercial Lifecycle Architecture

```text
                           SUBCONTRACTOR AWARD
                                    │
                                    ▼
                                CONTRACT
                         (contracts + items BOQ)
                                    │
                  ┌─────────────────┼─────────────────┐
                  ↓                 ↓                 ↓
              CONTRACT        CONTRACT BOQ       DOCUMENTS
                TERMS         (Rates & Qty)    (Bank Guarantee,
                  │                 │          CAR Insurance)
                  │                 ▼                 │
                  │           WORK PACKAGES           │
                  │                 │                 │
                  │                 ▼                 ▼
                  │           SITE EXECUTION     COMPLIANCE GATE
                  │                 │                 │
                  │                 ▼                 │
                  │         MEASUREMENT BOOK          │
                  │        (Site Verification)        │
                  │                 │                 │
                  │                 ▼                 │
                  │          QS CERTIFICATION         │
                  │                 │                 │
                  │                 ▼                 │
                  │         RA BILL SUBMISSION        │
                  │                 │                 │
                  ▼                 ▼                 ▼
             RETENTION          DEDUCTIONS         CLAIMS
              LEDGER          (Advance, TDS)   (EOT, Variation)
                  │                 │                 │
                  └────────────┬────┴─────────────────┘
                               │
                               ▼
                        SO-D APPROVAL
               (QS Certify ➔ PM Approve ➔ Finance Pay)
                               │
                               ▼
                            PAYMENT
                               │
                               ▼
                       REVISED CONTRACT &
                        CASH FLOW LEDGER
```

---

## 3. Database Schema Models: Contracts, Retention & Claims

### `contracts` and `contract_items`
```sql
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    contractor_id UUID NOT NULL,
    contract_number TEXT NOT NULL,
    title TEXT NOT NULL,
    scope_description TEXT NOT NULL,
    contract_type TEXT NOT NULL DEFAULT 'ITEM_RATE' CHECK (contract_type IN ('ITEM_RATE', 'LUMP_SUM', 'COST_PLUS', 'PERCENTAGE')),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'TENDERED', 'AWARDED', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'TERMINATED', 'CLOSED')),
    
    original_value NUMERIC(14, 2) NOT NULL,
    approved_variations NUMERIC(14, 2) NOT NULL DEFAULT 0,
    revised_value NUMERIC(14, 2) GENERATED ALWAYS AS (original_value + approved_variations) STORED,
    
    retention_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    defect_liability_months INTEGER NOT NULL DEFAULT 12,
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE contract_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    description TEXT NOT NULL,
    uom TEXT NOT NULL,
    contract_qty NUMERIC(14, 4) NOT NULL,
    contract_rate NUMERIC(14, 4) NOT NULL,
    total_amount NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(contract_qty * contract_rate, 2)) STORED,
    
    measured_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
    certified_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
    billed_qty NUMERIC(14, 4) NOT NULL DEFAULT 0
);
```

### `retention_ledger` (Append-Only Retention Audit Trail)
```sql
CREATE TABLE retention_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    contract_id UUID NOT NULL REFERENCES contracts(id),
    ra_bill_id UUID REFERENCES ra_bills(id),
    
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('WITHHELD', 'RELEASED', 'FORFEITED', 'ADJUSTED')),
    amount NUMERIC(14, 2) NOT NULL,
    cumulative_balance NUMERIC(14, 2) NOT NULL,
    
    release_reason TEXT,
    authorized_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

### `claims` and `claim_events` (Commercial Dispute & Delay Claims)
```sql
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    contract_id UUID NOT NULL REFERENCES contracts(id),
    claim_number TEXT NOT NULL,
    claim_type TEXT NOT NULL CHECK (claim_type IN ('EOT', 'DELAY_COMPENSATION', 'VARIATION_DISPUTE', 'PRICE_ESCALATION', 'IDLE_RESOURCE', 'ADDITIONAL_WORK')),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ASSESSED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'SETTLED')),
    
    claimed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    claimed_extension_days INTEGER NOT NULL DEFAULT 0,
    
    assessed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    assessed_extension_days INTEGER NOT NULL DEFAULT 0,
    
    approved_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    approved_extension_days INTEGER NOT NULL DEFAULT 0,
    
    justification TEXT NOT NULL,
    submitted_at TIMESTAMPTZ,
    assessed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 4. Segregation of Duties (SoD) Commercial Authorization Grid

| Workflow Action | Subcontractor | Site Engineer | Commercial / QS | Project Manager | Finance VP / Org Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| **Submit Measurement** | 🟢 (Draft) | 🟢 (Verify) | ❌ | ❌ | ❌ |
| **Certify Quantities** | ❌ | ❌ | 🟢 (Certify) | ❌ | ❌ |
| **Submit RA Bill** | 🟢 (Submit) | ❌ | ❌ | ❌ | ❌ |
| **Review & Apply Deductions** | ❌ | ❌ | 🟢 (Compute) | ❌ | ❌ |
| **Approve RA Bill** | ❌ | ❌ | ❌ | 🟢 (Signoff) | ❌ |
| **Authorize Retention Release** | ❌ | ❌ | ❌ | ❌ | 🟢 (Authorize) |
| **Disburse Bank Payment** | ❌ | ❌ | ❌ | ❌ | 🟢 (Pay) |
| **Assess & Settle Claims** | ❌ | ❌ | 🟢 (Assess) | 🟢 (Approve) | 🟢 (Executive Settle) |
