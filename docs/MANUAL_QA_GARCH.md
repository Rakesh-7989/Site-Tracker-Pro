# Manual QA — G-Arch Seeded Role Sign-In Checklist

Runs against **live** https://sitetrack-rakesh.vercel.app using the seeded
"G Architects" org (2026-08-10). One user per identity role; one construction
project **G Arch Demo Villa** (`55419fbe-2cc2-4ddd-a2b1-d9219f2af159`).

- Credentials: `GARCHITECTS_CREDENTIALS.md` (gitignored — never commit).
- Email pattern: `garch.<role>@sitetrack.test`.
- **12 roles** hold a `project_members` row on the demo villa (construction-valid).
- Roles **without** project membership still see the org surface but not the project.
- **superadmin** is platform-only (no org, no project).

> Mark each row ✅/❌/⚠ with the date. A ❌ = bug to log; a ⚠ = needs a
> design/consultant/interior project to test fully (out of current seed scope).

## 1. Cross-cutting checks (every role)

- [ ] Login lands on the correct dashboard (`RoleDashboard` role mapping).
- [ ] Sidebar shows only capability-gated links (no `PM Dashboard` for anyone).
- [ ] Org switcher shows "G Architects"; segment badge correct.
- [ ] Topbar org logo/name = G Architects (branding).
- [ ] Language switch en → hi → te renders all strings (spot-check key screens).
- [ ] Dark-mode toggle: no hardcoded gray/white leaks on visited screens.
- [ ] Mobile (360–430px): sidebar drawer, tabs overflow, no horizontal scroll.

## 2. Per-role matrix

| # | Role | Landing | Project access | Key checks | Blocks (verify AccessDenied) |
|---|------|---------|---------------|------------|------------------------------|
| 1 | superadmin | Platform | — | Platform nav + Staff; cross-tenant views | n/a (all caps) |
| 2 | orgadmin | Org Home | — | Members/Billing/Departments; Pipeline; Vendors; add member → invite flow | Platform, Staff |
| 3 | promoter | Org Home | — | Org surface; firm-wide reports | Platform, Staff |
| 4 | project_admin | Org Home | ✅ villa | Projects list; project admin actions; consultancy manager caps | Platform, Staff |
| 5 | prospector | Org Home | — | Pipeline (CRM); New Project; Vendors; create lead → meeting → quote | Platform, Staff |
| 6 | pm | **/pm** | ✅ villa | PM Dashboard landing; Projects; New Project; Client Portal; PO tabs; DPR | Platform, Org Home, **Vendors** |
| 7 | architect | Project | ✅ villa | Overview; time log; deliverables; drawings; milestone edit | Platform, Staff |
| 8 | senior_architect | Project | ✅ villa | Same as architect + manager caps | Platform, Staff |
| 9 | junior_architect | Project | ✅ villa | Time log; review comments (contributor) | manager actions |
| 10 | design_architect_interior | Org | — | FF&E caps present; needs interior project for MoodBoards/Rooms ⚠ | project (construction) |
| 11 | design_head | Org | — | Design + consultancy manager caps; needs design project ⚠ | project (construction) |
| 12 | consultant_head | Org | — | Inspection + Reports tabs (needs consultant project) ⚠ | project (construction) |
| 13 | mep_consultant | Project | ✅ villa | MEP tabs; drawings register | manager actions |
| 14 | structural_consultant | Project | ✅ villa | Structural tabs; drawings register | manager actions |
| 15 | consultant | Org | — | Time log on consultancy project ⚠ | project (construction) |
| 16 | designer | Org | — | Deliverables on design project ⚠ | project (construction) |
| 17 | site_engineer | Project | ✅ villa | DPR composer → submit → history → detail → PDF; attendance; daily snapshot | manager actions |
| 18 | contractor | Project | ✅ villa | Purchase Orders; material requests; receipts (GRN); inventory | Platform, Staff |
| 19 | sub_contractor | Project | ✅ villa | Attendance view; assigned scopes | manager actions |
| 20 | vendor | Org | — | Vendor Portal: quotes submit, own POs, payment status, profile edit | Platform, Staff, projects |
| 21 | client | Org | ✅ villa | Client Portal (share:client:portal); project updates; NOT New Project/Pipeline | New Project, Pipeline |
| 22 | site_inspector | Project | ✅ villa | Inspections → fail spawns Corrective Action; Compliance nav | manager actions |

## 3. Core workflow sweeps (pick per role)

1. **CRM (prospector/orgadmin)** — Lead → Meeting → Quotation → Accept → Agreement → Won. Verify funnel + byOwner split. H2 idempotency (double-convert blocked).
2. **Consultancy** (pm/project_admin on a consultant/design project) — log time → approve → rate card → generate hourly/retainer invoice → line items → Monthly Statement PDF.
3. **Procurement** (pm/contractor) — Material Request → approve → PO (from request) → Receipt/GRN → inventory inward row → request becomes `received`.
4. **FF&E** (architect on interior/design) — schedule entries → quotes → best-value scoring → Raise PO → rollup at `/ffe`.
5. **DPR** (site_engineer) — compose → voice (mock) → geotag photo → submit → offline queue (toggle network off) → history → detail → Download PDF → WhatsApp share (env-gated).
6. **Finance** (orgadmin/pm) — invoice payment statuses (Paid/Partial/Pending/Overdue); `/invoices` rollup.
7. **Quality** (site_inspector) — fail inspection → Corrective Action auto-opens → advance to verified.
8. **Platform** (superadmin) — billing/audit/usage/settings/branding gates; impersonation banner.

## 4. Regression sign-off

| Date | Roles swept | Workflows | Smoke | e2e-live | Notes / Bugs |
|------|------------|-----------|-------|----------|--------------|
| | | | | | |
