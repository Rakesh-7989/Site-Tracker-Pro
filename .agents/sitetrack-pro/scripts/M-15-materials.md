# M-15: Materials — CRUD, POs, Status Tracking

## Roles
- Tester roles: Architect (full), PM (full), Contractor (view), Client (no access)

## Pre-requisites
- [ ] Logged in as Architect
- [ ] Project with Materials tab enabled
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Open a project. Click "Materials" tab | Materials dashboard: material list with columns: Name, Category, Unit, Required Qty, Ordered Qty, Received Qty, Status | | |
| 2 | Click "Add Material" | Form: name, category (dropdown: Cement/Steel/Sand/Brick/Electrical/Plumbing/Other), unit, required quantity, rate | | |
| 3 | Fill: Name = "Test Cement", Category = Cement, Unit = bags, Qty = 100, Rate = 350, click Save | Material appears in list: Qty = 100, Ordered = 0, Received = 0, Status = "To Order" | | |
| 4 | Click the material row | Detail panel: full info, PO history, received lots, edit/delete buttons | | |
| 5 | Click "Create PO" | PO form: vendor name, quantity to order, expected delivery date | | |
| 6 | Fill: Vendor = "Test Supplier", Qty = 50, Date = +7 days, click Save | PO created. Status changes to "Partially Ordered" (if total > 50). PO table shows new entry | | |
| 7 | Click "Receive" or "Add Receipt" | Receipt form: quantity received, received date, quality check (Pass/Fail) | | |
| 8 | Enter Qty = 20, Quality = Pass, click Save | Received Qty = 20. Status updates. If PO fully received, shows "Completed" | | |
| 9 | Click "Edit" on the material → change required qty to 120, Save | Required Qty updates. Ordered/Received unchanged. Recalculation of remaining | | |
| 10 | Click "Delete" on the material | Confirmation dialog. Confirm → material removed from list. POs referencing it still visible in purchase history | | |
| 11 | Log out. Log in as **Contractor**. Open same project → Materials tab | Materials visible. No Add/Create PO/Edit/Delete buttons. Read-only | | |
| 12 | Log out. Log in as **Client**. Open same project | Materials tab **not visible** or shows "No access" | | |
