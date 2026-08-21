# SiteTrack Pro — Vertical Slice Audit: RA Bills & Measurement Book Financial Governance

> **Authority Document:** Comprehensive end-to-end trace of **RaBillsTab ➔ financeQueries.ts / mbRaQueries.ts ➔ Measurement Book (`measurement_book`, `mb_items`) ➔ RA Bills (`ra_bills`, `ra_bill_mb_links`, `ra_bill_payments`) ➔ Retention Governance ➔ Financial State Machine & Ledger ➔ RLS Policies & Audit Trail**.

---

## 1. RA Bills Findings & Remediation Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `RA-001` | Security / RLS | 🔴 **P1** | **Finance Tables Use Generic `FOR ALL` Project Write Policy**<br>`can_write_project()` allows any project editor to insert, update, approve, or delete financial records. | Split granular RLS policies per operation and financial capability. | ✅ Architected |
| `RA-002` | Authorization | 🔴 **P1** | **`rabill:approve` Exists Only as UI Check**<br>Database permits direct row mutations without verifying approval capability. | Enforce `rabill:approve` capability at DB/RPC boundary. | ✅ Specified |
| `RA-003` | Domain Logic | 🔴 **P1** | **Submit, Approve, Reject, Pay Coerced into Generic Status UPDATE**<br>`setRaBillStatus()` handles all lifecycle transitions with a single patch. | Separate into discrete domain commands: `submitRaBill()`, `approveRaBill()`, `rejectRaBill()`, `recordRaPayment()`. | ✅ Separated |
| `RA-004` | Financial Ledger | 🔴 **P1** | **`paid` Stored as Simple Row Status Instead of Payment Ledger**<br>Lacks payment transactions table (`ra_bill_payments`); cannot capture multi-payment metadata. | Introduce `ra_bill_payments` ledger table capturing payment reference, date, mode, and actor. | ✅ Architected |
| `RA-005` | Financial Logic | 🔴 **P1** | **Partial Payments Not Supported in Data Model**<br>Status can only be `paid` or not, lacking `partially_paid` state and derived balance tracking. | Support `partially_paid` status + derived `total_paid` and `remaining_payable` from payments ledger. | ✅ Architected |
| `RA-006` | Audit / Auth | 🔴 **P1** | **Browser-Supplied Payment Actor Identity**<br>Payment records could accept client-provided user IDs. | Enforce authoritative server-side resolution via `auth.uid()`. | ✅ Enforced |
| `RA-007` | Authorization | 🔴 **P1** | **Delete Permission Tied to `rabill:create` in UI**<br>UI permitted anyone with `rabill:create` to delete RA bills. | Decouple UI: delete action guarded via administrative delete permission (`canDelete`). | ✅ Fixed |
| `RA-008` | Data Integrity | 🔴 **P1** | **Hard Deletion of Approved/Paid RA Bills**<br>`deleteRaBill()` executes `DELETE FROM ra_bills`, destroying financial history. | Disallow deletion of submitted/approved/paid bills; enforce controlled cancellation. | ✅ Targeted |
| `RA-009` | Concurrency | 🟠 **P2** | **Browser-Entered / Colliding RA Bill Numbers**<br>Client manual text input allows duplicate bill numbers within project. | Implement atomic project-scoped sequence via DB sequence / unique constraint. | ✅ Targeted |
| `RA-010` | Financial Integrity | 🔴 **P1** | **Client-Authoritative Bill Amount Calculation**<br>Server accepts client-calculated `billAmount` without independent DB verification against MB items. | Enforce server-side authoritative amount computation from linked MB entries. | ✅ Enforced |
| `RA-011` | Domain Invariant | 🔴 **P1** | **Double-Billing Risk on Measurement Book (MB) Entries**<br>Lacks strict DB-level exclusion ensuring an MB entry cannot be billed on multiple RA bills. | Enforce invariant trigger setting `mb_entries.status = 'billed'` with unique active link. | ✅ Architected |
| `RA-012` | Domain Quality | 🟢 **P2** | **Measurement Book Drift Detection Architecture Sound**<br>UI detects when underlying MB quantity/rate changes post-billing. | Hardened with server-side validation during approval. | ✅ Retained |
| `RA-013` | Financial Integrity | 🔴 **P1** | **"Recalculate All" Dangerously Modifies Approved Bills**<br>Bulk recalculation function modifies approved/paid bill amounts. | Restrict recalculation strictly to `draft` state; require credit/debit notes post-approval. | ✅ Hardened |
| `RA-014` | Financial RBAC | 🔴 **P1** | **Retention Release Grouped Under Generic Approval**<br>`releaseRaRetention()` shares generic write permissions instead of specialized finance authorization. | Dedicated `rabill:retention:release` capability with defect-liability period validation. | ✅ Separated |

---

## 2. RA Bill & Measurement Book Lifecycle Architecture

```text
               MEASUREMENT BOOK (MB)
                        │
                        ▼
               Eligible MB Entries
                        │
                        ▼
                  RA BILL DRAFT
                        │
           ┌────────────┼────────────┐
           ↓            ↓            ↓
        Quantity       Rate       Retention
           │            │            │
           └────────────┼────────────┘
                        │ (rabill:submit)
                        ▼
                   SUBMITTED
                        │
                        ▼
                 [VALIDATE MB & DRIFT]
                        │
                        ▼
                  UNDER_REVIEW
                        │
                        │ (rabill:approve with threshold check & signature)
                        ▼
                   APPROVED ────► [IMMUTABLE FINANCIAL RECORD]
                        │
                        ▼
                PAYMENT_PENDING
                        │
           ┌────────────┴────────────┐
           │ (payment:record)        │ (payment:record)
           ▼                         ▼
     PARTIALLY_PAID                 PAID
           │                         │
           └────────────┬────────────┘
                        │
                        ▼
                 RETENTION_HELD
                        │
                        │ (rabill:retention:release post-DLP)
                        ▼
               RETENTION_RELEASED
```

---

## 3. Financial Ledger & Immutable Payment Data Model

```text
ra_bills
────────────────────────────────────────
id                      UUID (PK)
project_id              UUID (FK -> projects)
bill_number             TEXT (UNIQUE with project_id: e.g. RA-001)
subcontractor_id        UUID (FK -> sub_contractors)
scope_description       TEXT
gross_amount            NUMERIC(15,2) (Server-verified sum of linked MB items)
retention_pct           NUMERIC(5,2)  (Default: 5.00%)
retention_amount        NUMERIC(15,2) (gross_amount * retention_pct / 100)
tds_pct                 NUMERIC(5,2)  (Default: 1.00% or 2.00%)
tds_amount              NUMERIC(15,2) (gross_amount * tds_pct / 100)
gst_pct                 NUMERIC(5,2)  (Default: 18.00%)
gst_amount              NUMERIC(15,2) (gross_amount * gst_pct / 100)
net_payable             NUMERIC(15,2) (gross_amount + gst_amount - retention_amount - tds_amount)
status                  TEXT (draft, submitted, under_review, approved, payment_pending, partially_paid, paid, cancelled)
retention_released      BOOLEAN (Default: FALSE)
retention_released_at   TIMESTAMPTZ
retention_released_by   UUID (FK -> profiles)
created_by              UUID (FK -> profiles)
created_at              TIMESTAMPTZ

ra_bill_mb_links
────────────────────────────────────────
id                      UUID (PK)
ra_bill_id              UUID (FK -> ra_bills)
mb_entry_id             UUID (FK -> measurement_book)
billed_quantity         NUMERIC(12,3)
billed_rate             NUMERIC(12,2)
billed_amount           NUMERIC(15,2)
UNIQUE(mb_entry_id)     -- Guarantees single active billing invariant!

ra_bill_payments
────────────────────────────────────────
id                      UUID (PK)
ra_bill_id              UUID (FK -> ra_bills)
payment_reference       TEXT (e.g. UTR / Cheque / NEFT number)
amount                  NUMERIC(15,2)
payment_date            DATE
payment_mode            TEXT (neft, rtgs, cheque, upi)
bank_account_id         UUID (FK -> bank_accounts)
paid_by                 UUID (authoritative auth.uid())
created_at              TIMESTAMPTZ
```

---

## 4. Unified V4 Authorization Kernel (Financial Settlement Domain)

```text
                      DOMAIN COMMAND: record_ra_payment()
                                      │
                                      ▼
                               AUTHENTICATION
                           (auth.uid() resolution)
                                      │
                                      ▼
                               PROJECT ROLE
                        (finance_head, orgadmin)
                                      │
                                      ▼
                           FINANCIAL CAPABILITY
                         (payment:record / rabill:pay)
                                      │
                                      ▼
                          AMOUNT VALIDATION INVARIANT
                (payment.amount <= ra_bill.remaining_payable)
                                      │
                                      ▼
                            TRANSACTIONAL LEDGER
               ┌──────────────────────┼──────────────────────┐
               ↓                      ↓                      ↓
      INSERT ra_bill_payments  UPDATE ra_bills        SYNC cashflow_ledger
      (immutable payment row)  (status & paid_amount) (org / project cash outflow)
               │                      │                      │
               └──────────────────────┼──────────────────────┘
                                      │
                                      ▼
                             EMIT AUDIT EVENT
                            (RA_PAYMENT_RECORDED)
```
