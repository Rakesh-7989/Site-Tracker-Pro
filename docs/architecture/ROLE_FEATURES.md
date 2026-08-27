# Role → Features Reference

*Auto-generated from `src/auth/permissions-matrix.ts` + `capabilityLabels.ts`
— the single source of truth. Do not hand-edit; regenerate after a role change.*

## How to read this

SiteTrack has a **3-axis** role model — a user can hold a role at the
identity, org, and project level, and their real access is the **union**
of all three. The features below show the **base set a role gets when
provisioned the normal way**. A superadmin can further grant/revoke any
feature per role from **Role Permissions** (`/admin/roles`, migration 69).

**22 roles · 107 total capabilities.** Consolidated 2026-06-04.

## Quick index

| Role | What they are | Features |
|---|---|---|
| **Platform Admin** (`superadmin`) | Platform owner (you). Full access to every org + every feature. | 107 |
| **Firm Owner** (`orgadmin`) | Firm owner / workspace admin. Runs the org — members, billing, settings. | 50 |
| **Promoter** (`promoter`) | Paying builder / firm owner. Gets the 7am WhatsApp digest; finance + handover view. Owns the org but rarely logs in. | 12 |
| **Project Admin** (`project_admin`) | Back-office paperwork — invoices, RA bills, RERA / GST / EPFO filings. | 34 |
| **Sales / BD** (`prospector`) | Sales / BD. Creates draft projects for prospects; minimal access. | 50 |
| **Project Manager** (`pm`) | Project Manager. Runs project execution end-to-end (absorbed Project Head — full approval power). | 54 |
| **Architect** (`architect`) | Drawings + RFIs + BOQ + change orders. | 18 |
| **Senior Architect** (`senior_architect`) | Senior architect — supervises juniors, approves RFIs + change orders. | 24 |
| **Junior Architect** (`junior_architect`) | Junior architect — drafting + drawing revisions. | 11 |
| **Design Architect (Interior)** (`design_architect_interior`) | Interior design lead (absorbed Interior Designer) — drawings + materials. | 16 |
| **Design Head** (`design_head`) | Design Project lead — runs the design team. | 31 |
| **Consultant Head** (`consultant_head`) | Consultant Project lead. | 25 |
| **MEP Consultant** (`mep_consultant`) | MEP (mechanical / electrical / plumbing) consultant. | 15 |
| **Structural Consultant** (`structural_consultant`) | Structural engineer / consultant. | 15 |
| **Consultant** (`consultant`) | Generic consultant — markup + RFIs. | 8 |
| **Designer** (`designer`) | Designer (design projects) — drawings + updates. | 8 |
| **Site Engineer** (`site_engineer`) | The field role. Files DPRs (voice + photo), runs site ops + attendance (absorbed Site Supervisor + Civil Engineer). | 25 |
| **Contractor** (`contractor`) | Contractor — updates, attendance, RA bills, photos. | 10 |
| **Sub-contractor** (`sub_contractor`) | Sub-contractor — updates, attendance, RFIs, photos. | 6 |
| **Vendor** (`vendor`) | Material supplier — vendor portal: quotes, invoices, price master. | 4 |
| **Client / Unit Buyer** (`client`) | Unit buyer — read-only progress + payments + handover; client portal. | 8 |
| **Site Inspector (RERA)** (`site_inspector`) | External RERA / govt inspector — read-only audit (no filings; project_admin files returns). | 5 |

## Platform

### Platform Admin `superadmin`

*Platform owner (you). Full access to every org + every feature.*

- **Everything.** Full platform + every org + every feature, including impersonation, cross-org audit, and role-permission config.

## Org Leadership

### Firm Owner `orgadmin`

*Firm owner / workspace admin. Runs the org — members, billing, settings.*

- **Projects:** Create new projects, Archive projects, Restore archived projects, Edit project settings
- **Site Operations:** Delete site updates
- **Team & Attendance:** Manage project team
- **Materials & Procurement:** Delete materials, View material price master, Manage vendor directory, Select a vendor in PO / material / invoice forms, Approve purchase orders
- **RFIs & Change Orders:** Approve change orders
- **Finance & Billing:** Approve expenses, Approve RA bills, Approve invoices, View budget, Edit budget, View financial ledger, Generate hourly / retainer invoices, View revenue & billing rollups
- **Consultancy Engagements:** Manage fee phases & amounts, Log billable time, Manage all time entries, Create / edit deliverables, Approve / issue deliverables, Comment on review rounds, Open / close review rounds, View utilization reports, Manage rate cards, Approve / reject time entries, Manage monthly retainers
- **Architecture & Design:** Manage FF&E schedules & moodboards, Manage statutory approvals / NOC register, View & compare vendor quotes
- **Compliance & Filings:** View compliance status
- **Communications:** Configure notifications
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports, Export CSV data, Share project publicly
- **Handover:** Generate handover packets
- **Org Administration:** Manage org members, Manage billing / subscription, Manage integrations, Manage templates, Configure approval chains, Manage org notifications, Manage org branding, Configure feature flags

### Promoter `promoter`

*Paying builder / firm owner. Gets the 7am WhatsApp digest; finance + handover view. Owns the org but rarely logs in.*

- **Daily Reports (DPR):** View daily reports
- **Finance & Billing:** View budget, View financial ledger
- **Compliance & Filings:** View compliance status
- **Communications:** Subscribe to daily digest, Receive the 7am WhatsApp digest
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports, Export CSV data
- **Handover:** View handover packets, Sign handover packets

### Project Admin `project_admin`

*Back-office paperwork — invoices, RA bills, RERA / GST / EPFO filings.*

- **Progress & Milestones:** Add milestones, Edit milestones
- **Materials & Procurement:** View material price master, Select a vendor in PO / material / invoice forms, Approve purchase orders
- **Finance & Billing:** Create RA bills, Create invoices, View budget, View financial ledger, Generate hourly / retainer invoices, View revenue & billing rollups
- **Consultancy Engagements:** Manage fee phases & amounts, Log billable time, Manage all time entries, Create / edit deliverables, Approve / issue deliverables, Comment on review rounds, Open / close review rounds, View utilization reports, Manage rate cards, Approve / reject time entries, Manage monthly retainers
- **Architecture & Design:** Manage FF&E schedules & moodboards, Manage statutory approvals / NOC register, View & compare vendor quotes
- **Compliance & Filings:** View compliance status, File RERA returns, File GST returns, File EPFO returns
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports, Export CSV data
- **Handover:** Generate handover packets

### Sales / BD `prospector`

*Sales / BD. Creates draft projects for prospects; minimal access.*

- **Projects:** Create new projects, Edit project settings
- **Progress & Milestones:** Update overall progress %, Add milestones, Edit milestones, Delete milestones
- **Daily Reports (DPR):** Approve / publish DPRs, View daily reports
- **Site Operations:** Post site updates, Edit site updates, Delete site updates, Raise issues, Resolve issues, Close safety incidents
- **Team & Attendance:** Manage project team, Mark labour attendance, View attendance
- **Materials & Procurement:** Add materials, Edit materials, Manage vendor directory, Select a vendor in PO / material / invoice forms, Create / submit purchase orders
- **Drawings:** Upload drawings
- **RFIs & Change Orders:** Respond to RFIs, Close RFIs, Create change orders
- **Finance & Billing:** Add expenses, Create RA bills, View budget, View financial ledger, Generate hourly / retainer invoices, View revenue & billing rollups
- **Consultancy Engagements:** Manage fee phases & amounts, Log billable time, Manage all time entries, Create / edit deliverables, Approve / issue deliverables, Comment on review rounds, Open / close review rounds, View utilization reports, Manage rate cards, Approve / reject time entries, Manage monthly retainers
- **Architecture & Design:** View & compare vendor quotes
- **Compliance & Filings:** View compliance status
- **Communications:** Send in-app messages, Send WhatsApp messages
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports, Export CSV data

### Project Manager `pm`

*Project Manager. Runs project execution end-to-end (absorbed Project Head — full approval power).*

- **Projects:** Create new projects, Edit project settings
- **Progress & Milestones:** Update overall progress %, Add milestones, Edit milestones, Delete milestones
- **Daily Reports (DPR):** Approve / publish DPRs, View daily reports
- **Site Operations:** Post site updates, Edit site updates, Delete site updates, Raise issues, Resolve issues, Close safety incidents
- **Team & Attendance:** Manage project team, Mark labour attendance, View attendance
- **Materials & Procurement:** Add materials, Edit materials, Delete materials, View material price master, Select a vendor in PO / material / invoice forms, Create / submit purchase orders
- **Drawings:** Upload drawings
- **RFIs & Change Orders:** Respond to RFIs, Close RFIs, Create change orders
- **Finance & Billing:** Add expenses, Create RA bills, View budget, View financial ledger, Generate hourly / retainer invoices, View revenue & billing rollups
- **Consultancy Engagements:** Manage fee phases & amounts, Log billable time, Manage all time entries, Create / edit deliverables, Approve / issue deliverables, Comment on review rounds, Open / close review rounds, View utilization reports, Manage rate cards, Approve / reject time entries, Manage monthly retainers
- **Architecture & Design:** View & compare vendor quotes
- **Compliance & Filings:** View compliance status
- **Communications:** Send in-app messages, Send WhatsApp messages, Subscribe to daily digest, Receive the 7am WhatsApp digest
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports, Export CSV data
- **Handover:** Generate handover packets

## Architecture & Project Execution

### Architect `architect`

*Drawings + RFIs + BOQ + change orders.*

- **Site Operations:** Post site updates, Raise issues
- **Materials & Procurement:** View material price master
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ, Edit estimates
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Create change orders
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports, Export CSV data

### Senior Architect `senior_architect`

*Senior architect — supervises juniors, approves RFIs + change orders.*

- **Site Operations:** Post site updates, Edit site updates, Delete site updates, Raise issues, Resolve issues
- **Team & Attendance:** Manage project team
- **Materials & Procurement:** View material price master
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ, Edit estimates
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Close RFIs, Create change orders, Approve change orders
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports, Export CSV data

### Junior Architect `junior_architect`

*Junior architect — drafting + drawing revisions.*

- **Site Operations:** Post site updates, Raise issues
- **Drawings:** Upload drawings, Edit drawings, Mark up drawings
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed

## Design

### Design Architect (Interior) `design_architect_interior`

*Interior design lead (absorbed Interior Designer) — drawings + materials.*

- **Site Operations:** Post site updates
- **Materials & Procurement:** Add materials, Edit materials, View material price master, Select a vendor in PO / material / invoice forms
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed

### Design Head `design_head`

*Design Project lead — runs the design team.*

- **Site Operations:** Post site updates, Edit site updates
- **Team & Attendance:** Manage project team
- **Materials & Procurement:** View material price master
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ, Edit estimates
- **RFIs & Change Orders:** Respond to RFIs, Close RFIs, Approve change orders
- **Finance & Billing:** Generate hourly / retainer invoices, View revenue & billing rollups
- **Consultancy Engagements:** Manage fee phases & amounts, Log billable time, Manage all time entries, Create / edit deliverables, Approve / issue deliverables, Comment on review rounds, Open / close review rounds, View utilization reports, Manage rate cards, Approve / reject time entries, Manage monthly retainers
- **Architecture & Design:** Manage FF&E schedules & moodboards, Manage statutory approvals / NOC register, View & compare vendor quotes
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports

### Consultant Head `consultant_head`

*Consultant Project lead.*

- **Site Operations:** Post site updates
- **Materials & Procurement:** View material price master
- **Drawings:** Edit drawings, Mark up drawings
- **RFIs & Change Orders:** Respond to RFIs, Close RFIs, Approve change orders
- **Finance & Billing:** Generate hourly / retainer invoices, View revenue & billing rollups
- **Consultancy Engagements:** Manage fee phases & amounts, Log billable time, Manage all time entries, Create / edit deliverables, Approve / issue deliverables, Comment on review rounds, Open / close review rounds, View utilization reports, Manage rate cards, Approve / reject time entries, Manage monthly retainers
- **Architecture & Design:** Manage FF&E schedules & moodboards, Manage statutory approvals / NOC register, View & compare vendor quotes
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports

### Consultant `consultant`

*Generic consultant — markup + RFIs.*

- **Site Operations:** Post site updates
- **Drawings:** Mark up drawings
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed

### Designer `designer`

*Designer (design projects) — drawings + updates.*

- **Site Operations:** Post site updates
- **Drawings:** Upload drawings, Mark up drawings
- **RFIs & Change Orders:** Raise RFIs
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed

## Engineering & Field

### MEP Consultant `mep_consultant`

*MEP (mechanical / electrical / plumbing) consultant.*

- **Site Operations:** Post site updates, Create inspections, Close inspections
- **Materials & Procurement:** View material price master
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Create change orders
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed

### Structural Consultant `structural_consultant`

*Structural engineer / consultant.*

- **Site Operations:** Post site updates, Create inspections, Close inspections
- **Materials & Procurement:** View material price master
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Create change orders
- **Consultancy Engagements:** Log billable time, Create / edit deliverables, Comment on review rounds
- **Activity & Audit:** View activity feed

### Site Engineer `site_engineer`

*The field role. Files DPRs (voice + photo), runs site ops + attendance (absorbed Site Supervisor + Civil Engineer).*

- **Progress & Milestones:** Update overall progress %
- **Daily Reports (DPR):** File daily progress reports (DPR), View daily reports
- **Voice & Photos:** Record Telugu voice notes, Upload site photos
- **Site Operations:** Post site updates, Edit site updates, Raise issues, Resolve issues, Report safety incidents, Close safety incidents, Create inspections, Close inspections, Add punch-list items, Close punch-list items
- **Team & Attendance:** Mark labour attendance, View attendance, Manage labour records
- **Materials & Procurement:** Add materials, Edit materials, View material price master, Select a vendor in PO / material / invoice forms
- **Drawings:** Mark up drawings
- **RFIs & Change Orders:** Raise RFIs
- **Activity & Audit:** View activity feed

## Supply Chain

### Contractor `contractor`

*Contractor — updates, attendance, RA bills, photos.*

- **Voice & Photos:** Upload site photos
- **Site Operations:** Post site updates
- **Team & Attendance:** Mark labour attendance, View attendance
- **Materials & Procurement:** Add materials, View material price master, Select a vendor in PO / material / invoice forms
- **RFIs & Change Orders:** Raise RFIs
- **Finance & Billing:** Create RA bills
- **Activity & Audit:** View activity feed

### Sub-contractor `sub_contractor`

*Sub-contractor — updates, attendance, RFIs, photos.*

- **Voice & Photos:** Upload site photos
- **Site Operations:** Post site updates
- **Team & Attendance:** Mark labour attendance, View attendance
- **RFIs & Change Orders:** Raise RFIs
- **Activity & Audit:** View activity feed

### Vendor `vendor`

*Material supplier — vendor portal: quotes, invoices, price master.*

- **Materials & Procurement:** View material price master, Create / submit purchase orders
- **Finance & Billing:** Create invoices
- **Activity & Audit:** View activity feed

## External / Clients

### Client / Unit Buyer `client`

*Unit buyer — read-only progress + payments + handover; client portal.*

- **Daily Reports (DPR):** View daily reports
- **Consultancy Engagements:** Comment on review rounds
- **Compliance & Filings:** View compliance status
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports, Access the client portal
- **Handover:** View handover packets, Sign handover packets

### Site Inspector (RERA) `site_inspector`

*External RERA / govt inspector — read-only audit (no filings; project_admin files returns).*

- **Drawings:** Mark up drawings
- **Compliance & Filings:** View compliance status
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports

## Notes

- **Customisable.** A superadmin can grant/revoke any feature to any role
  per org (or globally) at `/admin/roles` — these overrides layer on top
  of the defaults below without a code change (migration 69).
- **Promoter = firm owner.** Provisioned as org `admin`, so they *can* do
  everything in their org — the finance-first dashboard is a UI choice.
- **site_engineer** is the single field role (absorbed site_supervisor +
  civil_engineer); it owns the voice-DPR wedge. **pm** absorbed project_head.
- Read-only roles (client, site_inspector, prospector) deliberately lack
  edit/approve features — least-privilege by design.

*Regenerate after any role/capability change:
`npx vitest run tests/_gen/roleFeatures.gen.test.ts`*
