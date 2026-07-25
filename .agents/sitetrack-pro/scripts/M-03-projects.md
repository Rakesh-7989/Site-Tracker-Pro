# M-03: Project CRUD — Navigation, Tabs, Create/Edit/Archive

## Roles
- Tester roles: Architect (create/edit), PM & Contractor & Client (view only)

## Pre-requisites
- [ ] Logged in as Architect
- [ ] Org has at least 2 existing projects
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Navigate to `/projects` | Project list/grid shows all projects in the org. Each card shows name, status, progress bar (if any), last updated date | | |
| 2 | Click on a project named (e.g.) "Skyline Tower" | Detail page loads. Tabs visible: Overview, Team, Tasks, Updates, Drawings, Issues, BOQ, Materials, DPR, Calendar | | |
| 3 | Click each tab (Overview → Calendar) one by one | Each tab loads without error. No 404, no blank white screen | | |
| 4 | Click "Overview" tab | Shows: project description, status badge, milestone summary, budget summary, recent updates | | |
| 5 | Click "Team" tab | Shows member list with roles. Same members as org member list, filtered to this project | | |
| 6 | Navigate back to `/projects`. Click "New Project" | Create project form: name, description, status dropdown, optional fields | | |
| 7 | Leave name empty, click Save | Inline validation: "Project name is required" | | |
| 8 | Enter "Test Project E2E" + description, select "Active", click Save | Project created. Redirected to new project's detail page. Toast: "Project created" | | |
| 9 | Click project name (pencil/edit icon) near top | Inline edit mode: editable name field | | |
| 10 | Change name to "Test Project E2E (edited)", press Enter or click Save | Name updates. Toast: "Project updated". Name shown in breadcrumb | | |
| 11 | Navigate to `/projects`. Find "Test Project E2E (edited)" in list | Listed. Name reflects edit | | |
| 12 | Open the project. Find "Archive" or "Change Status" action | Dropdown or button to change status | | |
| 13 | Change status to "Archived" or "Completed" | Status badge updates. Project may move to a different section of the list | | |
| 14 | Log out. Log in as **PM**. Navigate to `/projects` | PM sees all projects but **no** "New Project" or "Edit" buttons | | |
| 15 | Log out. Log in as **Contractor**. Navigate to `/projects` | Contractor sees assigned projects. No create/edit/archive controls | | |
| 16 | Log out. Log in as **Client**. Navigate to `/projects` | Client sees projects in read-only mode. Limited tabs (Overview, BOQ, Estimate, Drawings) | | |
