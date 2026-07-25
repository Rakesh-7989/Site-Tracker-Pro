# M-10: Roles — Role Access Matrix

## Roles
- Tester roles: Architect, PM, Contractor, Client (tested sequentially)

## Pre-requisites
- [ ] 4 test accounts: Architect, PM, Contractor, Client in the same org
- [ ] Same project accessible to all roles
- [ ] Browser: Chrome incognito

## How To Run

Test the access matrix below. For each capability, log in as each role and try to perform the action. Mark pass if the role has the expected access (can or cannot do it).

| # | Capability | Architect | PM | Contractor | Client |
|---|-----------|-----------|----|------------|--------|
| 1 | View project list | ✅ View all | ✅ View all | ✅ View assigned | ✅ View own |
| 2 | Create project | ✅ Yes | ❌ No | ❌ No | ❌ No |
| 3 | Edit project name/status | ✅ Yes | ❌ No | ❌ No | ❌ No |
| 4 | Add site update/DPR | ✅ Yes | ✅ Yes | ✅ Limited | ❌ No |
| 5 | Create issue | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| 6 | Close/reopen issue | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| 7 | View BOQ | ✅ Yes | ✅ Yes | ✅ Limited | ✅ Read-only |
| 8 | Edit BOQ | ✅ Yes | ❌ No | ❌ No | ❌ No |
| 9 | View budget/finance | ✅ Yes | ✅ Yes | ✅ Limited | ❌ No |
| 10 | View invoices | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| 11 | View drawings | ✅ Full | ✅ PM-visible | ✅ Contractor-visible | ✅ Client-visible |
| 12 | Release drawing | ✅ Yes | ❌ No | ❌ No | ❌ No |
| 13 | View materials | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| 14 | Create material PO | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| 15 | View members/team | ✅ Yes | ✅ Yes | ✅ Limited | ✅ Limited |
| 16 | Invite/remove members | ✅ Yes | ❌ No | ❌ No | ❌ No |
| 17 | View WhatsApp history | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| 18 | Send WhatsApp | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| 19 | Access kiosk | ❌ No | ❌ No | ✅ Yes | ❌ No |
| 20 | View DPR calendar | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| 21 | Submit DPR | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| 22 | Access admin panel | ❌ No | ❌ No | ❌ No | ❌ No |
| 23 | View audit log | ❌ No | ❌ No | ❌ No | ❌ No |
| 24 | Change org settings | ✅ Yes | ❌ No | ❌ No | ❌ No |

## Expected Verdict

All 4 roles should pass their expected capability matrix. Any deviation (e.g. Client seeing the "Create Issue" button) is a **Critical** severity bug.
