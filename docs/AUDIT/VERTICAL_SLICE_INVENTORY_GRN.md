# SiteTrack Pro — Vertical Slice Audit: Inventory, GRN & Material Management Architecture

> **Authority Document:** Comprehensive end-to-end trace of **Material Requests (Indents) ➔ PO Linkage ➔ Goods Received Notes (`po_receipts` / GRN) ➔ QC Inspection & Bins ➔ Append-Only Inventory Ledger (`inventory_ledger`) ➔ Multi-Location Stock Balances & Reservations ➔ Material Issue to Work Packages ➔ Site Consumption & Wastage ➔ BOQ & Real-Time Cost Engine**.

---

## 1. Inventory & Materials Findings Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `INV-001` | Architecture Integrity | 🟢 **P3** | **GRN ➔ Inventory Auto-Post Directionally Sound**<br>`AFTER INSERT` trigger on `po_receipts` automatically inserts inward `inventory_transactions`. | Retained & Strengthened: Keep automated pipeline, harden transaction isolation. | ✅ Verified |
| `INV-002` | Accounting / Inventory Integrity | 🔴 **P0** | **`po_receipts` Can Be Mutated Post-Posting Causing Stock Discrepancy**<br>Generic UPDATE RLS leaves prior posted inventory transaction unchanged when receipt qty changes. | Make posted GRN immutable; mandate compensating adjustment transactions. | ✅ Architected |
| `INV-003` | Data Integrity | 🔴 **P0** | **`po_receipts` Hard Delete Leaves Orphaned Inflated Stock**<br>Generic DELETE RLS deletes GRN row without issuing reversing inventory transaction. | Prevent hard deletion of posted receipts; require stock reversal. | ✅ Enforced |
| `INV-004` | Financial Ledger | 🔴 **P1** | **`inventory_transactions` Treated as Mutable CRUD**<br>Normal CRUD update allowed on stock transactions instead of append-only accounting ledger. | Strict append-only `inventory_ledger` with immutable entries. | ✅ Architected |
| `INV-005` | Stock Control | 🔴 **P1** | **Missing Real-Time Stock Balance & Available Valuation Model**<br>Ad-hoc sum of rows without persisted/materialized multi-location stock snapshots. | Authoritative `stock_balances` (`on_hand`, `reserved`, `available`). | ✅ Architected |
| `INV-006` | Location Domain | 🟠 **P2** | **Lack of Multi-Location / Store Subdivision in Inventory**<br>Inventory scoped purely to `project_id` without warehouse/yard `location_id`. | Multi-location warehouse/sub-store model under projects. | ✅ Architected |
| `INV-007` | Master Data | 🔴 **P1** | **Free-Text Material Names Lacking Material Master (SKU) Rigor**<br>Loose text matching ("Cement" vs "cement 43") leads to fragmented stock records. | Authoritative `materials` master catalog with SKU, brand, and unit specifications. | ✅ Architected |
| `INV-008` | Domain Modeling | 🟠 **P2** | **Unit Normalization & Conversion Missing**<br>Blind fallback to 'nos' prevents accurate metric conversions (e.g., MT to KG, Bags to KG). | Standardized unit conversion rules linked to material master. | ✅ Architected |
| `INV-009` | Allocation & Planning | 🔴 **P1** | **Missing Stock Reservation for Approved Indents**<br>Competing work crews can over-request materials without stock reservation check. | Reservation logic: `available_stock = on_hand - reserved_stock`. | ✅ Architected |
| `INV-010` | State Machine | 🔴 **P1** | **Simplistic Material Request Status Transition**<br>Any partial GRN immediately transitions request status to `received`. | Multi-state progress: `requested ➔ approved ➔ ordered ➔ partially_received ➔ received`. | ✅ Architected |
| `INV-011` | Over-Receiving Gate | 🔴 **P1** | **GRN Receipt Quantity Not Validated Against PO Remaining Quantity**<br>Absence of ceiling check allows receipts to exceed approved PO order quantity. | Invariant check: `SUM(received_qty) <= po_quantity` unless authorized tolerance. | ✅ Enforced |
| `INV-012` | Financial Integrity | 🔴 **P1** | **Client-Authoritative GRN `amount` and `unit_price` Calculation**<br>DB accepts client-calculated financial totals on receipt entry. | Server-authoritative derivation: `amount = qty * unit_price`. | ✅ Enforced |
| `INV-013` | Quality Governance | 🔴 **P1** | **Missing QC Inspection Gate Before Inventory Posting**<br>Delivery immediately increases usable stock before quality verification (accepted vs rejected). | QC gate with quarantine/rejected bin separation before stock posting. | ✅ Architected |
| `INV-014` | Reverse Logistics | 🟠 **P2** | **Missing Material Return to Store / Supplier Flow**<br>Lack of structured return transaction types (`material_return`, `vendor_return`). | Comprehensive inventory transaction types covering returns and transfers. | ✅ Architected |
| `INV-015` | Cost Accounting | 🔴 **P1** | **Disconnected Site Material Consumption ➔ BOQ / Cost Code Engine**<br>Material issues are not tagged to BOQ line items and work packages for real-time cost attribution. | Direct linkage: `Material Issue ➔ Work Package ➔ BOQ Item ➔ Cost Code ➔ Actual Cost`. | ✅ Architected |

---

## 2. Complete Inventory & Stock Control Ledger Architecture

```text
                       MATERIAL MASTER (SKU & Unit)
                                    │
                                    ▼
                         STOCK LOCATIONS / WAREHOUSES
                                    │
                        MATERIAL REQUEST (INDENT)
                                    │
                         PURCHASE ORDER (PO)
                                    │
                                    ▼
                          DELIVERY CHALLAN
                                    │
                                    ▼
                           QC / QA INSPECTION
                           ┌────────┴────────┐
                           ↓                 ↓
                        ACCEPTED          REJECTED (Vendor Return)
                           │
                           ▼
                    GOODS RECEIVED NOTE (GRN)
                  (Immutable Post Transaction)
                           │
                           ▼
                    INVENTORY LEDGER (Append-Only)
                    ┌────────────────────────────┐
                    │ + Inward (GRN)             │
                    │ - Outward (Material Issue) │
                    │ + Return (Unused Material) │
                    │ ± Transfer (Store to Store)│
                    │ ± Adjustment (Stock Count) │
                    └──────────────┬─────────────┘
                                   │
                                   ▼
                             STOCK BALANCE
                    ┌──────────────┴─────────────┐
                    ↓                            ↓
                 ON-HAND                      RESERVED
                    │                            │
                    └──────────────┬─────────────┘
                                   ↓
                               AVAILABLE
                                   │
                                   ▼
                         MATERIAL ISSUE TO SITE
                                   │
                                   ▼
                          WORK PACKAGE / TASK
                                   │
                                   ▼
                         BOQ ITEM & COST CODE
                                   │
                                   ▼
                     REAL-TIME PROJECT WIP & PnL
```

---

## 3. Inventory Transaction State Machine & Ledger Models

### `inventory_ledger` (Append-Only Immutable Ledger)
```sql
CREATE TABLE inventory_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    location_id UUID NOT NULL,
    material_id UUID NOT NULL,
    
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
      'RECEIPT', 'ISSUE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'OPENING_BALANCE', 'COUNT_CORRECTION'
    )),
    reference_type TEXT NOT NULL CHECK (reference_type IN ('PO_RECEIPT', 'MATERIAL_ISSUE', 'MATERIAL_RETURN', 'STOCK_TRANSFER', 'AUDIT_ADJUSTMENT')),
    reference_id UUID NOT NULL,
    
    quantity NUMERIC(14, 4) NOT NULL,
    unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    total_cost NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED,
    
    balance_after NUMERIC(14, 4) NOT NULL,
    
    actor_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 4. Multi-Role RBAC Specification for Site Inventory

- **Site Engineer**: `material_request:create`, `material_issue:create`, `inventory:view`
- **Storekeeper**: `grn:create`, `grn:verify`, `stock_issue:create`, `stock_transfer:create`, `stock_count:create`
- **QA/QC Engineer**: `material:inspect`, `grn:quality_verify`
- **Project Manager**: `material_request:approve`, `stock_adjustment:approve`, `inventory:view`
- **Finance / Commercial**: `inventory_value:view`, `material_cost:view`, `cost_code:reconcile`
