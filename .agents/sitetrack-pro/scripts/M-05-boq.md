# M-05: BOQ — Items, Budget Impact, Import

## Roles
- Tester roles: Architect (full), PM (view), Contractor (view-limited), Client (view-limited)

## Pre-requisites
- [ ] Logged in as Architect
- [ ] Project with BOQ tab enabled
- [ ] A BOQ CSV/XLSX file ready (or sample data)
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Open a project. Click "BOQ" tab | BOQ table/dashboard: items list with columns: Item code, Description, Unit, Qty, Rate, Amount. Summary totals at top | | |
| 2 | Verify summary section | Shows: Total BOQ Value, Contingency %, Total Budget. Numbers should be non-zero for a real project | | |
| 3 | Click "Add Item" | Form: item code, description, unit (dropdown: sq.ft / nos / lumpsum / etc), quantity, rate | | |
| 4 | Fill: Item = "E2E-TEST-001", Desc = "Test item", Unit = "nos", Qty = 10, Rate = 500, click Save | Item appears in table: Amount = 5,000. Total BOQ Value updates by +5,000 | | |
| 5 | Click on the E2E-TEST-001 row | Detail panel or inline expand: shows full details. Edit + Delete buttons present | | |
| 6 | Click Edit. Change Qty to 20, Rate to 600. Save | Amount updates to 12,000. Total BOQ Value adjusted | | |
| 7 | Click Delete on the item | Confirmation: "Delete this BOQ item?" | | |
| 8 | Confirm delete | Item removed. Total BOQ Value decreased | | |
| 9 | Click "Import BOQ" or "Import" | File picker modal: accepts .csv, .xlsx. Template download link available | | |
| 10 | Upload a valid BOQ file | Preview of imported items. "Import X items?" confirmation. Accept → items added to table | | |
| 11 | Upload an invalid file (wrong format) | Error toast: "Invalid format. Please upload a CSV or XLSX file" | | |
| 12 | Log out. Log in as **Client**. Open same project → BOQ tab | BOQ visible in read-only mode. No Add/Edit/Delete/Import buttons | | |
