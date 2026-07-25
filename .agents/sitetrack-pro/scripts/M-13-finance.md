# M-13: Finance — Invoices, RA Bills, Budget, Ledger

## Roles
- Tester roles: Architect (full), PM (view), Contractor (view-limited), Client (no access)

## Pre-requisites
- [ ] Logged in as Architect
- [ ] Project has BOQ items and at least one RA bill
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Open a project. Navigate to Finance/Billing tab | Finance dashboard: budget overview, RA bills table, invoice list, payment ledger | | |
| 2 | Verify budget section | Shows: Total Budget (from BOQ), Amount Billed, Amount Paid, Balance. Percentages match | | |
| 3 | Click "RA Bills" section | RA bill table: RA number, date, amount, status (Draft/Submitted/Approved/Paid), linked BOQ items | | |
| 4 | Click "New RA Bill" | RA bill form: select BOQ items with quantities, auto-calculates amount. Add description/notes | | |
| 5 | Create a new RA Bill for 2 BOQ items, click Save | RA Bill created with status "Draft". Shows in table. Budget summary updates | | |
| 6 | Click on the RA Bill → "Submit" | Status changes to "Submitted". Timestamp recorded | | |
| 7 | If approval workflow exists: click "Approve" | Status → "Approved". Budget "Amount Billed" increases | | |
| 8 | Navigate to Invoices section | Invoice list: invoice number, date, RA bill reference, amount, status, PDF download | | |
| 9 | Click "Generate Invoice" for the approved RA Bill | Invoice generated with unique number. PDF download starts or link appears | | |
| 10 | Open downloaded PDF | Contains: org logo, invoice number, date, BOQ items, amounts, GST/TDS if applicable, total | | |
| 11 | Navigate to Ledger | Transaction list: all payments received, with date, reference, amount, mode (UPI/NEFT/Cheque) | | |
| 12 | Log out. Log in as **Client**. Navigate to same project | Finance tab **not visible** or shows "No access" | | |
