# Role → Features Reference

*Auto-generated from `src/auth/permissions-matrix.ts` — the single
source of truth. Do not hand-edit; regenerate after any role change.*

## How to read this

SiteTrack has a **3-axis** role model — a user can hold a role at the
identity, org, and project level, and their real access is the **union**
of all three. The features below show the **full set a role gets when
provisioned the normal way** (identity + their org tier if elevated +
their project assignment). A user added to fewer tiers gets a subset.

**22 roles · 90 total capabilities.** Consolidated 2026-06-04.

## Quick index

| Role | What they are | Features |
|---|---|---|
| **Platform Admin** (`superadmin`) | Platform owner (you). Full access to every org + every feature. | 90 |
| **Firm Owner** (`orgadmin`) | Firm owner / workspace admin. Runs the org — members, billing, settings. | 23 |
| **Promoter** (`promoter`) | Paying builder / firm owner. Gets the 7am WhatsApp digest; finance + handover view. Owns the org but rarely logs in. | 28 |
| **Project Admin** (`project_admin`) | Back-office paperwork — invoices, RA bills, RERA / GST / EPFO filings. | 32 |
| **Sales / BD** (`prospector`) | Sales / BD. Creates draft projects for prospects; minimal access. | 2 |
| **Project Manager** (`pm`) | Project Manager. Runs project execution end-to-end (absorbed Project Head — full approval power). | 36 |
| **Architect** (`architect`) | Drawings + RFIs + BOQ + change orders. | 13 |
| **Senior Architect** (`senior_architect`) | Senior architect — supervises juniors, approves RFIs + change orders. | 18 |
| **Junior Architect** (`junior_architect`) | Junior architect — drafting + drawing revisions. | 6 |
| **Design Architect (Interior)** (`design_architect_interior`) | Interior design lead (absorbed Interior Designer) — drawings + materials. | 12 |
| **Design Head** (`design_head`) | Design Project lead — runs the design team. | 14 |
| **Consultant Head** (`consultant_head`) | Consultant Project lead. | 8 |
| **MEP Consultant** (`mep_consultant`) | MEP (mechanical / electrical / plumbing) consultant. | 11 |
| **Structural Consultant** (`structural_consultant`) | Structural engineer / consultant. | 11 |
| **Consultant** (`consultant`) | Generic consultant — markup + RFIs. | 5 |
| **Designer** (`designer`) | Designer (design projects) — drawings + updates. | 4 |
| **Site Engineer** (`site_engineer`) | The field role. Files DPRs (voice + photo), runs site ops + attendance (absorbed Site Supervisor + Civil Engineer). | 23 |
| **Contractor** (`contractor`) | Contractor — updates, attendance, RA bills, photos. | 8 |
| **Sub-contractor** (`sub_contractor`) | Sub-contractor — updates, attendance, RFIs, photos. | 5 |
| **Vendor** (`vendor`) | Material supplier — vendor portal: quotes, invoices, price master. | 4 |
| **Client / Unit Buyer** (`client`) | Unit buyer — read-only progress + payments + handover; client portal. | 7 |
| **Site Inspector (RERA)** (`site_inspector`) | External RERA / govt inspector — read-only audit + RERA filing. | 6 |

## Platform

### Platform Admin `superadmin`

*Platform owner (you). Full access to every org + every feature.*

- **Everything.** Full platform + every org + every feature, including impersonation and cross-org audit.

## Org Leadership

### Firm Owner `orgadmin`

*Firm owner / workspace admin. Runs the org — members, billing, settings.*

- **Projects:** Create new projects, Archive projects, Restore archived projects, Edit project settings
- **Team & Attendance:** Manage project team
- **Finance & Billing:** View budget, Edit budget, View financial ledger
- **Compliance & Filings:** View compliance status
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports, Export CSV data, Share project publicly
- **Handover:** Generate handover packets
- **Org Administration:** Manage org members, Manage billing / subscription, Manage integrations, Manage templates, Configure approval chains, Manage org notifications, Manage org branding, Configure feature flags

### Promoter `promoter`

*Paying builder / firm owner. Gets the 7am WhatsApp digest; finance + handover view. Owns the org but rarely logs in.*

- **Projects:** Create new projects, Archive projects, Restore archived projects, Edit project settings
- **Daily Reports (DPR):** View daily reports
- **Team & Attendance:** Manage project team
- **Finance & Billing:** View budget, Edit budget, View financial ledger
- **Compliance & Filings:** View compliance status
- **Communications:** Subscribe to daily digest, Receive the 7am WhatsApp digest
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports, Export CSV data, Share project publicly
- **Handover:** Generate handover packets, View handover packets, Sign handover packets
- **Org Administration:** Manage org members, Manage billing / subscription, Manage integrations, Manage templates, Configure approval chains, Manage org notifications, Manage org branding, Configure feature flags

### Project Admin `project_admin`

*Back-office paperwork — invoices, RA bills, RERA / GST / EPFO filings.*

- **Projects:** Create new projects, Archive projects, Restore archived projects, Edit project settings
- **Progress & Milestones:** Add milestones, Edit milestones
- **Team & Attendance:** Manage project team
- **Finance & Billing:** Create RA bills, Approve RA bills, Create invoices, Approve invoices, View budget, Edit budget, View financial ledger
- **Compliance & Filings:** View compliance status, File RERA returns, File GST returns, File EPFO returns
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports, Export CSV data, Share project publicly
- **Handover:** Generate handover packets
- **Org Administration:** Manage org members, Manage billing / subscription, Manage integrations, Manage templates, Configure approval chains, Manage org notifications, Manage org branding, Configure feature flags

### Sales / BD `prospector`

*Sales / BD. Creates draft projects for prospects; minimal access.*

- **Projects:** Create new projects
- **Activity & Audit:** View activity feed

### Project Manager `pm`

*Project Manager. Runs project execution end-to-end (absorbed Project Head — full approval power).*

- **Projects:** Create new projects, Edit project settings
- **Progress & Milestones:** Update overall progress %, Add milestones, Edit milestones, Delete milestones
- **Daily Reports (DPR):** Approve / publish DPRs, View daily reports
- **Site Operations:** Post site updates, Edit site updates, Raise issues, Resolve issues
- **Team & Attendance:** Manage project team, Mark labour attendance, View attendance
- **Materials & Procurement:** Add materials, Edit materials, Create / submit purchase orders
- **Drawings:** Upload drawings
- **RFIs & Change Orders:** Respond to RFIs, Close RFIs, Create change orders, Approve change orders
- **Finance & Billing:** Add expenses, Approve expenses, Create RA bills, Approve RA bills, View budget, View financial ledger
- **Compliance & Filings:** View compliance status
- **Communications:** Send in-app messages, Send WhatsApp messages
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports, Export CSV data

## Architecture & Project Execution

### Architect `architect`

*Drawings + RFIs + BOQ + change orders.*

- **Site Operations:** Post site updates, Raise issues
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ, Edit estimates
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Create change orders
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports

### Senior Architect `senior_architect`

*Senior architect — supervises juniors, approves RFIs + change orders.*

- **Site Operations:** Post site updates, Edit site updates, Raise issues, Resolve issues
- **Team & Attendance:** Manage project team
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ, Edit estimates
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Close RFIs, Create change orders, Approve change orders
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports

### Junior Architect `junior_architect`

*Junior architect — drafting + drawing revisions.*

- **Site Operations:** Post site updates
- **Drawings:** Upload drawings, Edit drawings, Mark up drawings
- **RFIs & Change Orders:** Raise RFIs
- **Activity & Audit:** View activity feed

## Design

### Design Architect (Interior) `design_architect_interior`

*Interior design lead (absorbed Interior Designer) — drawings + materials.*

- **Site Operations:** Post site updates
- **Materials & Procurement:** Add materials, Edit materials, View material price master
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs
- **Activity & Audit:** View activity feed

### Design Head `design_head`

*Design Project lead — runs the design team.*

- **Site Operations:** Post site updates, Edit site updates
- **Team & Attendance:** Manage project team
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **BOQ & Estimates:** Edit BOQ, Edit estimates
- **RFIs & Change Orders:** Respond to RFIs, Close RFIs, Approve change orders
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports

### Consultant Head `consultant_head`

*Consultant Project lead.*

- **Site Operations:** Post site updates
- **Drawings:** Edit drawings, Mark up drawings
- **RFIs & Change Orders:** Respond to RFIs, Close RFIs, Approve change orders
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports

### Consultant `consultant`

*Generic consultant — markup + RFIs.*

- **Site Operations:** Post site updates
- **Drawings:** Mark up drawings
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs
- **Activity & Audit:** View activity feed

### Designer `designer`

*Designer (design projects) — drawings + updates.*

- **Site Operations:** Post site updates
- **Drawings:** Upload drawings, Mark up drawings
- **Activity & Audit:** View activity feed

## Engineering & Field

### MEP Consultant `mep_consultant`

*MEP (mechanical / electrical / plumbing) consultant.*

- **Site Operations:** Post site updates, Create inspections, Close inspections
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Create change orders
- **Activity & Audit:** View activity feed

### Structural Consultant `structural_consultant`

*Structural engineer / consultant.*

- **Site Operations:** Post site updates, Create inspections, Close inspections
- **Drawings:** Upload drawings, Edit drawings, Release drawing revisions, Mark up drawings
- **RFIs & Change Orders:** Raise RFIs, Respond to RFIs, Create change orders
- **Activity & Audit:** View activity feed

### Site Engineer `site_engineer`

*The field role. Files DPRs (voice + photo), runs site ops + attendance (absorbed Site Supervisor + Civil Engineer).*

- **Progress & Milestones:** Update overall progress %
- **Daily Reports (DPR):** File daily progress reports (DPR), Approve / publish DPRs, View daily reports
- **Voice & Photos:** Record Telugu voice notes, Upload site photos
- **Site Operations:** Post site updates, Edit site updates, Raise issues, Resolve issues, Report safety incidents, Create inspections, Close inspections, Add punch-list items, Close punch-list items
- **Team & Attendance:** Mark labour attendance, View attendance, Manage labour records
- **Materials & Procurement:** Add materials, Edit materials
- **Drawings:** Mark up drawings
- **RFIs & Change Orders:** Raise RFIs
- **Activity & Audit:** View activity feed

## Supply Chain

### Contractor `contractor`

*Contractor — updates, attendance, RA bills, photos.*

- **Voice & Photos:** Upload site photos
- **Site Operations:** Post site updates
- **Team & Attendance:** Mark labour attendance, View attendance
- **Materials & Procurement:** Add materials
- **RFIs & Change Orders:** Raise RFIs
- **Finance & Billing:** Create RA bills
- **Activity & Audit:** View activity feed

### Sub-contractor `sub_contractor`

*Sub-contractor — updates, attendance, RFIs, photos.*

- **Voice & Photos:** Upload site photos
- **Site Operations:** Post site updates
- **Team & Attendance:** Mark labour attendance
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
- **Compliance & Filings:** View compliance status
- **Activity & Audit:** View activity feed
- **Export & Sharing:** Export PDF reports, Access the client portal
- **Handover:** View handover packets, Sign handover packets

### Site Inspector (RERA) `site_inspector`

*External RERA / govt inspector — read-only audit + RERA filing.*

- **Drawings:** Mark up drawings
- **Compliance & Filings:** View compliance status, File RERA returns
- **Activity & Audit:** View activity feed, Read audit log
- **Export & Sharing:** Export PDF reports

## Notes

- **Promoter = firm owner.** Provisioned as org `admin`, so they *can*
  do everything in their org — the finance-first dashboard is a UI choice,
  not a hard limit.
- **site_engineer** is the single field role (absorbed site_supervisor +
  civil_engineer); it owns the voice-DPR wedge.
- **pm** absorbed project_head, so it now holds `rabill:approve` + full
  export. **design_architect_interior** absorbed interior_designer.
- Read-only roles (client, site_inspector, prospector) deliberately lack
  edit/approve features — least-privilege by design.

*Regenerate: restore `tests/_gen/roleFeatures.gen.test.ts` and run
`npx vitest run tests/_gen/roleFeatures.gen.test.ts`.*
