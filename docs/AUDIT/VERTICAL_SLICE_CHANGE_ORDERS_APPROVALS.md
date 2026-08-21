# SiteTrack Pro — Vertical Slice Audit: Change Orders & Financial Approval Governance

> **Authority Document:** Comprehensive end-to-end trace of **ChangeOrdersTab ➔ designQueries.ts ➔ Database (`change_orders`, `change_order_approvals`) ➔ `approvalChains.ts` Core Engine ➔ Commercial Segregation of Duties ➔ Financial & Schedule Baseline Synchronization ➔ RLS Policies & Audit Trail**.

---

## 1. Change Orders Findings & Remediation Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `CO-001` | Authorization | 🔴 **P1** | **`changeorder:approve` Exists Only as UI Check**<br>Database policy relies on `can_write_project()` allowing any write-member to bypass approval gate. | Enforce distinct `changeorder:approve` capability check at DB / RPC command boundary. | ✅ Specified |
| `CO-002` | Security / RLS | 🔴 **P1** | **`change_orders` Write Policy Overly Broad**<br>V3 bridge creates single `FOR ALL` policy with `can_write_project()`, conflating create, approve, and delete. | Split policies per operation: separate INSERT, UPDATE (status gated), DELETE (restricted). | ✅ Architected |
| `CO-003` | Lifecycle | 🔴 **P1** | **Arbitrary Change Order State Transitions**<br>Generic `UPDATE change_orders SET status = <value>` permits illegal transitions (e.g. approved ➔ submitted). | Implement strict state machine (`draft` ➔ `submitted` ➔ `pending_approval` ➔ `approved` ➔ `implemented` ➔ `closed`). | ✅ Architected |
| `CO-004` | Approval Engine | 🔴 **P1** | **Disconnected from Repository `approvalChains` Core**<br>`approvalChains` supports ₹0+ and ₹5L+ tiers, but UI updates `status` directly without invoking chain. | Connect Change Order approvals directly to `approvalChains` multi-step resolution engine. | ✅ Unified |
| `CO-005` | Financial RBAC | 🔴 **P1** | **Threshold-Based Approval Not Enforced**<br>High-value change orders (> ₹5L) can be approved without Org Admin escalation. | Enforce financial ceiling approval matrices in domain command layer. | ✅ Architected |
| `CO-006` | Audit / Auth | 🔴 **P1** | **Browser-Supplied `raisedBy` Identity in `createChangeOrder()`**<br>Client payload supplies `raisedBy` user ID directly to insert mutation. | Enforce authoritative server-side resolution via `auth.uid()`. | ✅ Enforced |
| `CO-007` | Concurrency | 🟠 **P2** | **Browser-Generated CO Numbers Subject to Collisions**<br>`CO-${rows.length + 1}` computed client-side without atomic DB sequence. | Implement atomic project-scoped sequence via DB sequence / trigger. | ✅ Targeted |
| `CO-008` | Authorization | 🔴 **P1** | **Delete Permission Tied to `changeorder:create` in UI**<br>UI permitted anyone with `changeorder:create` to delete change orders. | Decouple UI: delete action guarded via administrative delete permission (`canDelete`). | ✅ Fixed |
| `CO-009` | Data Integrity | 🔴 **P1** | **Hard Deletion of Approved Financial Records**<br>`deleteChangeOrder()` executes `DELETE FROM change_orders`, destroying financial audit evidence. | Disallow deletion of approved/submitted COs; enforce controlled cancellation workflow. | ✅ Targeted |
| `CO-010` | Financial Governance | 🔴 **P1** | **No Segregation of Duties (Creator Can Approve)**<br>System does not prevent `creator == approver` on financial change orders. | Enforce domain rule ensuring `raised_by != approver_id` for approval actions. | ✅ Architected |
| `CO-011` | Audit Evidence | 🟠 **P2** | **Missing Approval Signatures and Comments Trail**<br>Only status is updated without capturing approval signatures, comments, and timestamps. | Introduce `change_order_approvals` table capturing immutable signature and decision trail. | ✅ Architected |
| `CO-012` | Financial Integrity | 🟠 **P2** | **Cost & Schedule Impact Not Transactionally Synced to Budget/Forecast**<br>Approving a CO does not update revised contract value, project budget, or master schedule. | Implement transactional sync updating project commercial baseline upon CO approval. | ✅ Architected |
| `CO-013` | Audit Trail | 🟠 **P2** | **No Immutable Audit Trail on Change Order Lifecycle Transitions**<br>Lifecycle transitions mutate row directly without appending to `audit_events`. | Centralize audit emission for all change order lifecycle transitions. | ✅ Architected |

---

## 2. Industry-Specific Change Order Lifecycle & Approval Thresholds

```text
                               CHANGE ORDER LIFECYCLE
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ↓                            ↓                            ↓
     1. INITIATION / SCOPE         2. TECHNICAL REVIEW          3. COMMERCIAL SIGNOFF
   (Contractor / Site Eng)         (Lead Arch / Consultant)      (PM / Client / Org Admin)
           │                            │                            │
           ▼                            ▼                            ▼
   changeorder:create           changeorder:review           changeorder:approve
```

### Approval Threshold Matrix (Default Configuration)

| Financial Value Tier | Required Approver Role | Required Evidence | Escalation Rules |
|---|---|---|---|
| **Tier 1: < ₹50,000** | Project Manager (PM) | Reason & Cost Breakdown | Site PM signoff |
| **Tier 2: ₹50,000 – ₹5,00,000** | Lead Architect / PM | Technical Drawing Reference + Signature | Architect verification |
| **Tier 3: > ₹5,00,000** | Org Admin / Commercial Director | Formal Client Written Approval + Exec Signature | Org Admin mandatory approval |

---

## 3. Change Order State Machine & Financial Sync

```text
               ┌──────────────┐
               │    DRAFT     │
               └──────┬───────┘
                      │ changeorder:create
                      ▼
               ┌──────────────┐
               │  SUBMITTED   │ ◄── (Contractor / Site Eng details scope & cost)
               └──────┬───────┘
                      │
           ┌──────────┴──────────┐
           │                     │ (changeorder:reject)
           ▼                     ▼
    ┌──────────────┐      ┌──────────────┐
    │ PENDING_APP  │      │   REJECTED   │
    └──────┬───────┘      └──────────────┘
           │
           │ (changeorder:approve with threshold check & signature)
           ▼
    ┌──────────────┐
    │   APPROVED   │ ────► [TRANSACTIONAL SYNC: Revised Contract Value += costImpact]
    └──────┬───────┘       [TRANSACTIONAL SYNC: Target Completion Date += daysImpact]
           │
           ▼
    ┌──────────────┐
    │ IMPLEMENTED  │ ◄── (Scope incorporated into site work & BOQ)
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │    CLOSED    │ ◄── (Final measurement & commercial settlement)
    └──────────────┘
```

---

## 4. Segregation of Duties & Approval Evidence Data Model

```text
change_orders
──────────────────────────────────────
id                      UUID (PK)
project_id              UUID (FK -> projects)
co_number               TEXT (UNIQUE with project_id: e.g. CO-001)
title                   TEXT
description             TEXT
cost_impact             NUMERIC(15,2)
schedule_impact_days    INTEGER
reason                  TEXT
status                  TEXT (draft, submitted, pending_approval, approved, rejected, implemented, closed, cancelled)
raised_by               UUID (authoritative auth.uid())
raised_at               TIMESTAMPTZ

change_order_approvals
──────────────────────────────────────
id                      UUID (PK)
change_order_id         UUID (FK -> change_orders)
approver_id             UUID (FK -> profiles)
role                    TEXT (e.g. architect, pm, orgadmin)
tier                    INTEGER (1, 2, 3)
decision                TEXT (approved, rejected)
comment                 TEXT
signature_data          TEXT
approved_at             TIMESTAMPTZ
```

---

## 5. Unified V4 Authorization Kernel (Financial Domain)

```text
                      DOMAIN COMMAND: approve_change_order()
                                      │
                                      ▼
                               AUTHENTICATION
                           (auth.uid() resolution)
                                      │
                                      ▼
                              PROJECT MEMBERSHIP
                         (project_role_for(project_id))
                                      │
                                      ▼
                           SEGREGATION OF DUTIES
                         (raised_by != approver_id)
                                      │
                                      ▼
                            THRESHOLD EVALUATION
                   (cost_impact vs user_approval_ceiling)
                                      │
                                      ▼
                           TRANSACTIONAL EXECUTION
               ┌──────────────────────┼──────────────────────┐
               ↓                      ↓                      ↓
      UPDATE change_orders    INSERT approvals       SYNC project_budgets
      (status = 'approved')   (signature & comments) (revised_contract_val)
               │                      │                      │
               └──────────────────────┼──────────────────────┘
                                      │
                                      ▼
                             EMIT AUDIT EVENT
                        (CHANGE_ORDER_APPROVED)
```
