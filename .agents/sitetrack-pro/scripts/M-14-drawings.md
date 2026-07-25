# M-14: Drawings — Drawing Release, Supersede, Client Visibility

## Roles
- Tester roles: Architect (full), PM (view), Contractor (view released), Client (view released-limited)

## Pre-requisites
- [ ] Logged in as Architect
- [ ] Project with Drawings tab enabled
- [ ] 2+ drawing files (PDF/DWG) ready
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Open a project. Click "Drawings" tab | Drawing register: table with columns: Drawing No., Title, Revision, Status, Date, Download | | |
| 2 | Click "Upload Drawing" or "New Drawing" | Upload form: drawing number, title, revision number, file upload (PDF/DWG), optional description | | |
| 3 | Upload "A-001 Floor Plan.pdf", Rev = 1, click Upload | File uploads with progress bar. Entry appears in register: status = "Draft" | | |
| 4 | Click the drawing row or "Release" button | Confirmation: "Release this drawing? It will be visible to PM, Contractor, and Client" | | |
| 5 | Confirm release | Status changes to "Released". Timestamp recorded. Download button now active for all roles | | |
| 6 | Log out. Log in as **PM**. Open same project → Drawings tab | Released drawing visible. Download works. Status shows "Released" | | |
| 7 | Log out. Log in as **Architect**. Upload "A-001 Floor Plan Rev 2.pdf" with Rev = 2 | New revision uploaded alongside Rev 1. Both visible. Rev 1 marked "Superseded" | | |
| 8 | Release Rev 2 | Rev 1 stays "Superseded", Rev 2 becomes "Released". PM/Contractor see only Rev 2 as default | | |
| 9 | Log out. Log in as **Client**. Open Drawings tab | Released drawings visible. Superseded drawings hidden or collapsed. Download works | | |
