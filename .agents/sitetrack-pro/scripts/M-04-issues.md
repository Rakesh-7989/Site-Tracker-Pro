# M-04: Issues — Create, Edit, Close, Reopen

## Roles
- Tester roles: Architect (full), PM (full), Contractor (create), Client (read-only)

## Pre-requisites
- [ ] Logged in as Architect
- [ ] At least one project with issues tab enabled
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Open a project. Click "Issues" tab | Issue list: table or card view with columns: ID, title, status, priority, assignee, category. Filter/search bar present | | |
| 2 | Click "New Issue" | Issue create form opens: title, description, priority (Low/Medium/High/Critical), category dropdown, optional assignee, optional photo upload | | |
| 3 | Leave title empty, click Save | Inline validation: "Title is required" | | |
| 4 | Fill title = "Test issue — leaking pipe", priority = High, category = "Plumbing", click Save | Issue created. Redirected to issue detail. Toast: "Issue created" | | |
| 5 | On issue detail page, verify fields | Title, priority badge (red for High), category, status = "Open", created date, author name visible | | |
| 6 | Click "Edit" or pencil icon | Editable fields appear (title, description, priority, assignee) | | |
| 7 | Change priority to Medium, add assignee (yourself), click Save | Fields update. Toast: "Issue updated". Priority badge changes to yellow | | |
| 8 | Click "Close Issue" or "Resolve" button | Status changes to "Closed" or "Resolved". Timestamp shows when. Button changes to "Reopen" | | |
| 9 | Click "Reopen" | Status back to "Open". Toast: "Issue reopened" | | |
| 10 | Navigate back to issues list | Issue shows with updated status. Filters work: filter by status = "Open" to hide it, then "Closed" to show it | | |
| 11 | Log out. Log in as **Contractor**. Open same project → Issues tab | See "New Issue" button (Contractor can create issues). Create one with title "Contractor issue" | | |
| 12 | Created issue shows in list with Contractor as author | | | |
| 13 | Log out. Log in as **Client**. Open same project → Issues tab | Issue list visible but **no** "New Issue", "Edit", or "Close" buttons. Read-only | | |
