# SiteTrack Pro — Vertical Slice Audit: Procurement & Procure-to-Pay (P2P) Architecture

> **Authority Document:** Comprehensive end-to-end trace of **Material Requests (Indents) ➔ RFQ & Quotation Comparison ➔ Purchase Orders (`purchase_orders`, `purchase_order_items`) ➔ Budget Reservation ➔ Goods Received Notes (`goods_receipts` / GRN) ➔ QC Inspection ➔ 3-Way Matching ➔ Vendor Invoices ➔ Financial Payments ➔ Audit Lineage**.

---

## 1. Procurement Findings & Remediation Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `PO-001` | Domain Model | 🔴 **P1** | **Purchase Order Treated as Simple CRUD Entity Rather Than Financial Commitment**<br>System stores PO as generic table row without binding to financial commitments, budget reservations, and supplier obligations. | Commitment-backed Procure-to-Pay domain linking budget line items to PO obligations. | ✅ Architected |
| `PO-002` | Security / RLS | 🔴 **P1** | **Generic `can_write_project()` RLS on `purchase_orders`**<br>V3 finance bridge applies single `FOR ALL` write policy allowing any project editor to mutate financial commitments. | Discrete RLS policies for `po:create`, `po:approve`, `po:issue`, `po:cancel`, `po:delete`. | ✅ Architected |
| `PO-003` | Approval Engine | 🔴 **P1** | **Missing Configurable Tiered PO Approval Thresholds**<br>High-value POs (> ₹25L) do not require Org Admin / Commercial Director signoff in backend rules. | Amount-based tiered approval chains (`approvalChains` integration) with configurable thresholds. | ✅ Architected |
| `PO-004` | Data Integrity | 🔴 **P1** | **Direct Mutation of Approved Purchase Orders**<br>Approved POs can be edited directly via generic UPDATE without generating formal PO amendments / revisions. | Approved PO immutability; revisions require formal `PO Change Order / Amendment` workflow. | ✅ Enforced |
| `PO-005` | Procurement Flow | 🔴 **P1** | **Direct PO Creation Without Material Requisition (Indent) Gate**<br>System permits direct PO creation by site engineers without upstream approved `material_requests`. | Material Requisition (Indent) ➔ PM Approval ➔ Procurement workflow. | ✅ Architected |
| `PO-006` | Sourcing Domain | 🔴 **P1** | **Missing RFQ & Multi-Vendor Commercial Quote Comparison Layer**<br>Sourcing jumps directly to single supplier selection without structured RFQ / quotation bidding comparisons. | `rfqs`, `rfq_items`, and `vendor_quotes` comparison matrix. | ✅ Architected |
| `PO-007` | Domain Modeling | 🟠 **P2** | **Vendor Entity Denormalization & Missing Master Record Rigor**<br>Loose vendor string matching vs authoritative `vendors` entity with GSTIN, PAN, and bank details. | First-class `vendors` domain model with statutory and bank account linkage. | ✅ Standardized |
| `PO-008` | Data Structure | 🔴 **P1** | **PO Stored as Flat Amount Lacking Structured Line Items**<br>`purchase_orders` stores single summary amount/items string without discrete `purchase_order_items`. | First-class `purchase_order_items` (BOQ ref, item, qty, unit, rate, GST, discount, line total). | ✅ Architected |
| `PO-009` | Financial Integrity | 🔴 **P1** | **Client-Authoritative PO Amount Calculation**<br>Server accepts client-calculated `amount` without independent server-side sum of line items. | Server-side authoritative amount computation from line items + tax rules. | ✅ Enforced |
| `PO-010` | Financial Integrity | 🔴 **P1** | **Missing Real-Time Budget Availability Check Before PO Approval**<br>System does not verify budget line item headroom (budget vs committed vs actual) before approving PO. | Pre-approval budget commitment validation trigger preventing unbudgeted overruns. | ✅ Architected |
| `PO-011` | Supply Chain | 🔴 **P1** | **Disconnected PO ➔ Goods Received Note (GRN) Delivery Tracking**<br>PO status can be updated without formal receiving and acceptance records. | Structured `goods_receipts` (GRN) with accepted vs rejected quantities and partial delivery tracking. | ✅ Unified |
| `PO-012` | Commercial Audit | 🔴 **P1** | **Missing 3-Way Matching (PO vs GRN vs Vendor Invoice)**<br>Invoices can be marked payable without automated cross-verification of ordered qty, received qty, and billed rate. | Automated 3-way matching engine detecting quantity, price, and tax variances. | ✅ Architected |
| `PO-013` | Payment Governance | 🔴 **P1** | **Invoice Payable Immediately Upon PO Approval Bypassing GRN Verification**<br>Payment workflow permits disbursements on PO approval alone without verified GRN receipt. | Payment eligibility strictly conditional on successful 3-way match or approved variance. | ✅ Enforced |
| `PO-014` | Exception Handling | 🔴 **P1** | **No Structured Invoice Exception / Quantity Mismatch Dispute Workflow**<br>Quantity and rate discrepancies cause hard fail without structured variance resolution or debit notes. | Commercial exception workflow for quantity/price variances with debit/credit note integration. | ✅ Architected |
| `PO-015` | Audit & Traceability | 🟠 **P2** | **No End-to-End Audit Traceability from Payment Back to Material Indent**<br>Disconnected audit trails between requisitions, purchase orders, delivery receipts, invoices, and bank payments. | Unified Procurement Audit Lineage: `Payment ➔ Invoice ➔ GRN ➔ PO ➔ RFQ ➔ Indent ➔ BOQ`. | ✅ Architected |

---

## 2. Complete Procure-to-Pay (P2P) Flow Architecture

```text
                    PROJECT NEED (Site Engineer)
                                │
                                ▼
                      MATERIAL REQUISITION
                   (material_requests: indent)
                                │
                                ▼ [PM Verification & Budget Check]
                                │
                                ▼
                       REQUEST FOR QUOTE
                            (rfqs)
                                │
             ┌──────────────────┼──────────────────┐
             ↓                  ↓                  ↓
       Vendor A Quote     Vendor B Quote     Vendor C Quote
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                                ▼
                       QUOTE COMPARISON
                                │
                                ▼ [Commercial Award]
                                │
                         PURCHASE ORDER
                     (purchase_orders + items)
                                │
                                ▼ [Approval Chain by Tiered Threshold]
                                │
                          PO APPROVED
                     (Commitment Reserved)
                                │
                                ▼
                       GOODS DELIVERY (Site)
                                │
                                ▼
                      GOODS RECEIVED NOTE
                      (goods_receipts: GRN)
                                │
                                ▼
                         QC INSPECTION
                         ┌──────┴──────┐
                         ↓             ↓
                      ACCEPTED      REJECTED
                         │             │
                         ▼             ▼
                    INVENTORY     VENDOR RETURN
                         │
                         ▼
                   VENDOR INVOICE
                         │
                         ▼
                    3-WAY MATCH
                    /     |     \
                   /      |      \
                 PO      GRN    Invoice
                   \      |      /
                    \     |     /
                         MATCH
                           │
             ┌─────────────┴─────────────┐
             ↓ (Pass)                    ↓ (Variance)
     PAYMENT ELIGIBLE            INVOICE EXCEPTION
             │                           │
             ▼                           ▼
      PAYMENT APPROVAL           COMMERCIAL REVIEW
             │                    (Debit/Credit Note)
             ▼
          PAYMENT
             │
             ▼
     COMMERCIAL CLOSED
```

---

## 3. Tiered PO Approval Matrix

| Purchase Order Value Tier | Required Approver Role | Approver Capability | Evidence & Signoff |
|---|---|---|---|
| **Tier 1: < ₹50,000** | Site Engineer / PM | `po:approve` | Requisition link & BOQ code |
| **Tier 2: ₹50,000 – ₹5,00,000** | Project Manager + Commercial Lead | `po:approve:tier2` | 3 Vendor quotes + Budget headroom |
| **Tier 3: ₹5,00,000 – ₹25,00,000** | Commercial Head / Finance VP | `po:approve:tier3` | Comparative statement + Payment terms |
| **Tier 4: > ₹25,00,000** | Org Admin / Managing Director | `po:approve:executive` | Board/Director signature + Milestone schedule |

---

## 4. End-to-End Audit Lineage Traceability

```text
PAYMENT
   │ (Payment Reference: UTR-99281, Amount: ₹12,40,000)
   ▼
INVOICE
   │ (Invoice No: INV-109, Vendor: ABC Steels Ltd, GSTIN: 36AAACB1234F1Z5)
   ▼
3-WAY MATCH
   │ (Matched: PO Qty 20 MT = GRN Qty 20 MT = Inv Qty 20 MT @ ₹62,000/MT)
   ▼
GOODS RECEIVED NOTE (GRN)
   │ (GRN-082, Gate Pass: GP-441, Delivery Challan: DC-8812, Weighbridge: WB-102)
   ▼
QUALITY INSPECTION
   │ (MTC Verified: Grade Fe500D, Yield Strength: 540 N/mm2, Status: APPROVED)
   ▼
PURCHASE ORDER
   │ (PO-034, Total: ₹12,40,000 + GST, Approved by: Commercial Head)
   ▼
RFQ & QUOTES
   │ (RFQ-017: ABC Steels ₹62k/MT vs XYZ TMT ₹64.5k/MT vs Prime Steel ₹63k/MT)
   ▼
MATERIAL REQUISITION
   │ (MR-201, Requested by: Site Eng Rakesh, Purpose: 4th Floor Slab Rebar)
   ▼
BOQ & BUDGET LINE
   │ (BOQ Item: B-03.04 Structural Steel, Budget: ₹85,00,000, Remaining: ₹32,00,000)
   ▼
PROJECT
     (Villa 07 Luxury Residences)
```
