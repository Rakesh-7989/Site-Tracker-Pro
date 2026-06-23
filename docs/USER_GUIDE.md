# SiteTrack Pro — User Study Guide

> Step-by-step guide to understand how roles, features, and workflows work.
> Each section ends with **test scenarios** — use these to verify you've learned correctly.

**Live at**: [https://sitetrack-rakesh.vercel.app](https://sitetrack-rakesh.vercel.app)

---

## Table of Contents

1. [Welcome & Platform Overview](#1-welcome--platform-overview)
2. [Quick Start (5 min)](#2-quick-start-5-min)
3. [Role-by-Role Study](#3-role-by-role-study)
   - 3.1 Platform Admin
   - 3.2 Org Leadership
   - 3.3 Project Execution
   - 3.4 Design & Engineering
   - 3.5 Supply Chain
   - 3.6 External
4. [Feature Walkthroughs](#4-feature-walkthroughs)
   - 4.1 Creating a Project
   - 4.2 Uploading & Releasing Drawings
   - 4.3 Submitting DPR
   - 4.4 Managing RA Bills
   - 4.5 Purchase Orders
   - 4.6 Running Labour Kiosk
   - 4.7 Managing Org Settings
   - 4.8 Running a Project — Full Lifecycle
   - 4.9 Handover & Compliance
   - 4.10 Analytics & Reports
5. [Kiosk Mode Guide](#5-kiosk-mode-guide)
6. [Admin Console Guide](#6-admin-console-guide)
7. [Troubleshooting](#7-troubleshooting)
8. [Quick Reference](#8-quick-reference)
9. [Test Your Knowledge](#9-test-your-knowledge)

---

## 1. Welcome & Platform Overview

### What is SiteTrack Pro?

Construction site management software built for Indian builders. Tracks every drawing, measurement, and rupee from site to office.

**4 project types** — determined at project creation, controls which tabs are visible:

| Type | Tabs | Best for |
|------|------|----------|
| Construction | 17 tabs (all) | High-rise, commercial, villa work |
| Interior | 12 tabs (no MB, Labour, Safety) | Fit-out, renovation firms |
| Design | 8 tabs (Drawings + Submittals + Quality) | Architecture-only firms |
| Consultant | 6 tabs (Inspections + Submittals + Audit) | PMC, QS firms |

**3 access modes:**
- **Browser** — full app at app.sitetrack.in
- **Mobile** — same app, responsive layout, bottom tab bar
- **Kiosk** — single-purpose screens for site gate / site office TV

**22 roles** across 3 tiers (identity, org, project) — a user inherits capabilities from all tiers they belong to.

### How this guide works

Each section follows the same pattern:
1. **Concept** — What is this? Why does it exist?
2. **Walkthrough** — Numbered steps to perform the task
3. **Test scenario** — QA checklist to verify understanding

---

## 2. Quick Start (5 min)

### Goal: Sign up, pick a role, see your dashboard

1. Open **app.sitetrack.in** in Chrome / Safari / Edge
2. You see the **Welcome back** login screen
3. Choose a sign-in path:

   **Path A — Magic link (production)**
   - Type your work email → Click "Send sign-in link"
   - Check inbox (and Spam) for the email
   - Click the link OR copy the 6-digit code → paste in OTP field
   - You're logged in as `client` role (read-only)

   **Path B — Demo mode (instant)**
   - Click "Load demo data" at the bottom
   - Wait ~2 sec → Click any role card → "Continue as..."
   - You're inside with pre-loaded data

   **Path C — Demo role only**
   - Click any role card → "Continue as..."
   - Empty workspace with that role's permissions

4. **What you see:**
   - Sidebar (desktop) or bottom tabs (mobile): Dashboard / Projects / Calendar / Search / Notifications
   - Greeting top-right: "Good morning, [name]"
   - 4 stat tiles: Projects Open / Issues / RA Bills Pending / Labour Active

### Test scenario

```
✅ As a new user with Client role:
  Step 1: Open app → see login screen
  Step 2: Click "Load demo data"
  Step 3: Click "Client" role card → "Continue as..."
  Expected: See read-only dashboard. No "New Project" button. No edit icons.
  Verify: Can you click into a project and see its tabs? Can you edit anything?
```

---

## 3. Role-by-Role Study

Each role family below includes: who they are → what they see → daily workflow → test scenario.

### 3.1 Platform Admin (Superadmin)

**Who**: SaaS operator (1-3 people). Manages all orgs, users, billing, and system-wide settings.

**What they see** (gated by `platform:orgs:manage`):
- `/admin` — Platform Dashboard (MRR, active orgs, signups)
- `/admin/orgs` — Org CRUD, plan changes, status toggle
- `/admin/users` — Cross-tenant user management, impersonation
- `/admin/roles` — Role permission configuration
- `/admin/signups` — Approve/reject signup requests
- `/admin/upgrades` — Process upgrade requests
- `/admin/staff` — Manage staff tiers (owner/head/member)
- `/admin/branding` — Platform-wide branding settings
- Settings: global feature flags, demo loader, kiosk toggles

**Daily workflow:**

1. **Morning**: Open `/admin` → Check MRR trend, new signups, churn alerts
2. **Mid-day**: Open `/admin/signups` → Review pending signups → Approve or reject
3. **Support**: Open `/admin/users` → Search for user → Click "Impersonate" → Debug issue → Stop impersonation
4. **EOD**: Open `/admin/orgs` → Check suspended orgs / plan downgrades → Export activity report

#### Test scenario

```
✅ As superadmin, manage an org:
  Step 1: Navigate to /admin/orgs
  Step 2: Click an org name → see org details
  Step 3: Change plan from Pro to Business
  Step 4: Navigate to /admin/users → find a user → click Impersonate
  Expected: You see the app as that user. Top bar shows IMPERSONATING badge.
  Step 5: Click "Stop impersonation" → return to your admin view
  Verify: Audit log recorded the impersonation session.

✅ Approve a signup:
  Step 1: /admin/signups → see pending request
  Step 2: Click Approve → user gets notified
  Expected: Org created. User can now log in.
  Verify: Can you reject a request? Does the user get notified?
```

### 3.2 Org Leadership

**Roles**: Orgadmin (Firm Owner), Promoter, Project Admin, Prospector (Sales/BD)

**Who**: People who run the construction firm. Manage team, billing, branding, and org-wide settings.

**What they see** (gated by `org:members:manage`):
- `/org` — Org Dashboard (plan info, members count, active projects)
- `/org/members` — Invite/edit/remove team members, bulk CSV import
- `/org/billing` — Subscription plan, Cashfree status, invoice history
- `/org/integrations` — Connect Cashfree, Razorpay, WhatsApp, AI provider
- `/org/templates` — Save project/BOQ templates for reuse
- `/org/approvals` — Configure approval chains per resource + threshold
- `/org/notifications` — Set auto-alert rules (in-app / email / WhatsApp)
- `/org/features` — Toggle 37 feature flags ON/OFF per org

**Daily workflow (Orgadmin):**

1. **Monday morning**: `/org/members` → Review who joined/left → Invite new architect
2. **Mid-week**: `/org/billing` → Check subscription is active → Download invoice
3. **Friday EOD**: `/org/approvals` → Adjust RA bill approval threshold → `/org/features` → Toggle ON drawing-diff for all projects

#### Test scenario

```
✅ As orgadmin, invite a new team member:
  Step 1: /org/members → Click "Add Member"
  Step 2: Enter email: newarchitect@firm.com → Role: Architect → Send invite
  Expected: Member appears with "Invited" status. They receive magic-link email.
  Step 3: Have the new user accept the invite and log in
  Verify: They see Architect-level nav. Can they see org admin panels? (No)

✅ Set up an approval chain:
  Step 1: /org/approvals → Select "RA Bill"
  Step 2: Threshold: ₹0-1L auto, ₹1L-5L PM, >₹5L Org Owner
  Step 3: Save
  Expected: When contractor creates RA bill, approval routing follows this chain.
  Verify: Create a test RA bill under ₹1L. Does it auto-approve?
```

### 3.3 Project Execution

**Roles**: PM (Project Manager), Architect (senior/junior), Site Engineer, Site Inspector

**Who**: People who execute construction work on the ground. Manage drawings, DPR, RFIs, attendance, and measurements.

**What they see**:
- `/dashboard` — Role-specific dashboard with relevant stats
- `/projects` — Project list with status
- `/dpr` — Daily Progress Report composer
- Project tabs (up to 17): Overview, Tasks, Updates, Materials, Vendors, POs, Invoices, BOQ, RA Bills, MB, Labour, Ledger, Drawings, Quality, Safety, Permits, Submittals, Equipment, Diary
- `/vendors` — Vendor directory
- `/calendar` — Project calendar
- `/activity` — Activity feed

**Daily workflow (PM):**

1. **8 AM on site**: Open mobile app → Quick capture → 5 photos of progress
2. **9 AM**: Mark attendance (47 workers present) → Log material receipt (80 bags cement)
3. **1 PM**: Open MB tab → Verify 6 entries from Site Engineer → Sign with finger
4. **4 PM**: Open RA Bills → Contractor submitted ₹3.2L → Verify → Approve
5. **6 PM**: Write daily diary → "Send to client via WhatsApp" → AI summary auto-generated → Sent

**Daily workflow (Architect):**

1. **10 AM**: Dashboard shows 3 pending RFIs → Open Drawings tab → Upload Rev B → Release to PM + Contractor
2. **12 PM**: Open RFIs tab → Respond to 3 pending → Attach reference drawing → Resolve
3. **3 PM onsite**: Open phone → Quick capture → 4 photos of slab finish → Voice note: "Tower B Floor 5 pour 80% done"

**Daily workflow (Site Engineer):**

1. **6 AM**: Open app offline → Review yesterday's MB rows
2. **10 AM**: Take measurements (slab thickness, column dimensions) → Enter in MB tab → Photos auto-attach GPS + timestamp
3. **2 PM**: Log issue → "Scaffolding damaged at Tower B" → Photo → Assign to safety officer
4. **5 PM**: Log labour worklog: 25 helpers × 8 hr × ₹600 = ₹1.2L
5. **6 PM**: Sync (auto when WiFi connects)

#### Test scenario

```
✅ As PM, create and approve a DPR:
  Step 1: Navigate to /dpr
  Step 2: Select project → Fill daily notes → Attach 3 photos
  Step 3: Click "Submit DPR"
  Expected: DPR saved. Status = Pending (if approval required) or Submitted.
  Step 4: As PM, verify DPR appears in your approval queue
  Step 5: Click Approve → DPR status = Approved
  Verify: Can the assigned Site Engineer see the approval status?

✅ As Architect, upload and release a drawing:
  Step 1: Open project → Drawings tab → Upload PDF
  Step 2: Auto-detects title and type from filename
  Step 3: Click "Release to: PM, Contractor, Client"
  Expected: Released drawing visible to selected roles. Old Rev A auto-superseded.
  Verify: Log in as Contractor. Can you see the released drawing? Can you see unreleased ones? (No)
```

### 3.4 Design & Engineering

**Roles**: Design Head, Consultant Head, Designer, Consultant, MEP Consultant, Structural Consultant

**Who**: Specialised design and engineering professionals. Manage drawings, specifications, inspections, and BOQ for their discipline.

**What they see** (subset of project tabs relevant to their discipline):
- Drawings tab — upload/edit/release/markup
- Submittals tab — drawings/material samples awaiting approval
- Inspections tab — schedule and run quality inspections
- BOQ tab — view/edit quantities for their discipline
- RFIs tab — respond to technical queries

**Daily workflow (MEP Consultant):**

1. **Morning**: Check RFIs → Respond to contractor queries on plumbing layout
2. **Mid-day**: Upload MEP drawings Rev C → Release to PM + contractor
3. **Afternoon**: Schedule inspection → Structural/MEP checklist → Fill results → Pass/Fail per item

#### Test scenario

```
✅ As MEP Consultant, respond to an RFI:
  Step 1: Open project → RFIs tab → See "What's the ducting spec for Floor 12?"
  Step 2: Type response: "800×400 mm G.I. ducting per DWG-MEP-012 Rev B"
  Step 3: Attach reference drawing → Click "Resolve"
  Expected: RFI status = Resolved. Contractor notified.
  Verify: Can you see RFIs from all disciplines or only MEP-related ones?
```

### 3.5 Supply Chain

**Roles**: Contractor, Sub-contractor, Vendor

**Who**: External firms executing work or supplying materials. Have limited write access to their own data.

**What they see**:
- **Contractor**: RA Bills tab (create), MB tab (view verified measurements), POs tab (accept/reject), Labour tab (mark attendance)
- **Sub-contractor**: Updates tab (log work), Attendance tab (mark), RFIs tab (create)
- **Vendor**: POs tab (view/accept/decline), Invoices tab (create), Materials tab (price view)

**Daily workflow (Contractor):**

1. **9 AM**: Worklogs → Log yesterday: "20 masons × 8 hr at Tower A"
2. **10 AM**: POs → New PO from PM for 200 bricks @ ₹8 → Accept
3. **3 PM**: MB tab → See PM verified 4 measurements worth ₹85,000
4. **4 PM**: RA Bills → "New RA bill" → Auto-filled from MB: ₹85,000 - 5% retention = ₹80,750 → Submit
5. **Friday**: Ledger tab → Check cumulative: ₹4.2L billed, ₹3.8L paid

**Daily workflow (Vendor):**

1. **Morning**: Open Vendor Portal (4 tabs: Dashboard / POs / Materials / Messages)
2. **Check POs**: New PO #42 from Greenfield Developers for cement → Accept
3. **Create Invoice**: Against delivered PO → Amount + GST auto-computed → Submit
4. **Messages**: Reply to PM's query on delivery timeline

#### Test scenario

```
✅ As Contractor, create an RA Bill:
  Step 1: Open project → MB tab → Verify your measurements are marked "Verified"
  Step 2: Open RA Bills tab → Click "New RA Bill"
  Step 3: App auto-fills: linked MB rows → amount = ₹85,000 → retention 5% = ₹4,250 → payable = ₹80,750
  Step 4: Add scope notes → Submit
  Expected: RA Bill status = Pending. PM gets notified.
  Verify: Log in as PM. Can you see the RA Bill in your approval queue?

✅ As Vendor, accept a PO and create invoice:
  Step 1: Open Vendor Portal → POs tab → See pending PO #42
  Step 2: Click Accept → Status = Accepted
  Step 3: Deliver materials → Open Invoices tab → Create invoice against PO #42
  Expected: Invoice created with auto-computed GST. PM notified of delivery.
  Verify: Can Vendor see other org's POs? (No — vendor scope is per-org)
```

### 3.6 External

**Roles**: Client / Unit Buyer, Site Inspector (RERA)

**Who**: End customers and statutory inspectors. Read-only access to specific data.

**What they see (Client):**
- `/dashboard` — Their projects only (filtered by `client_email`)
- Project Overview — Progress %, budget vs spent, milestone timeline
- Updates tab — Daily progress reports with photos (read-only)
- Drawings tab — Only released drawings (no WIP)
- Activity tab — Audit log filtered to released info
- Compliance tab — RERA filing status, permits, certificates

**What they see (Site Inspector):**
- Drawings tab — Markup only (cannot upload/release)
- Compliance tab — View RERA filings, permits
- Inspections tab — View scheduled inspections

**Client daily use:**

1. Check WhatsApp daily summary from builder (if enabled) — rarely needs to log in
2. When logged in: Dashboard → Progress % → Recent photos → Compliance docs
3. At handover: View handover packet → Sign digitally

#### Test scenario

```
✅ As Client, verify read-only access:
  Step 1: Log in as client@example.com
  Step 2: You see only projects where you are listed as client_email
  Step 3: Open a project → Click Updates tab → Scroll photos
  Step 4: Try to edit anything (click an edit button, try to delete a photo)
  Expected: No edit/delete buttons visible. Read-only everywhere.
  Verify: Can you see unreleased drawings? (No — only released ones)

✅ As Client, view compliance documents:
  Step 1: Open project → Compliance tab
  Step 2: See RERA filing status, permits, certificates
  Expected: All documents visible in read-only mode.
  Verify: Can you download PDFs? (Yes — export is allowed for client)
```

---

## 4. Feature Walkthroughs

### 4.1 Creating a Project

**Goal**: Set up a new construction project with type, team, and budget.

**Pre-requisites**: You have `project:create` capability (PM, Orgadmin, Prospector).

1. Navigate to **Sidebar → Projects → "New Project"** button
2. Fill project details:
   - Name: "Green Valley Phase II"
   - Site address: Auto-geocoded for map view
   - Start date + Expected end date
   - Budget: ₹5,00,00,000
   - Client name + email (they get read-only access)
3. Pick **Project Type**: Construction / Interior / Design / Consultant
4. Choose **Feature preset**: Lite / Standard / Full
5. Click **Save**

**Result**: Project appears in project list. You land on Overview tab.

#### Test scenario

```
✅ Create a construction project:
  Step 1: /projects/new
  Step 2: Fill name, address, dates, budget
  Step 3: Select type = Construction
  Step 4: Feature preset = Standard
  Step 5: Save
  Expected: New project created. All 17 tabs visible.
  Verify: Can you see the BOQ tab? Labour tab? RERA compliance?
  Change type to Interior → verify MB, Labour, Safety tabs disappear.
```

### 4.2 Uploading & Releasing Drawings

**Goal**: Upload a drawing revision, release it to specific roles, old revision auto-supersedes.

**Pre-requisites**: `drawings:upload` + `drawings:release` (Architect, Senior Architect, PM, Site Engineer).

1. Open project → **Drawings tab**
2. Click **Upload** → Select PDF/DWG/DXF/JPG
3. System auto-detects: title, type from filename
4. Choose **Revision**: Auto-increments (Rev A → Rev B)
5. Click **Upload** → Drawing appears in list
6. Select the drawing → Click **Release**
7. Pick recipients: ☑ PM ☑ Contractor ☐ Client
8. Click **Confirm Release**
9. Old Rev A auto-flips to "Superseded" (history retained)

**Result**: Selected recipients see the drawing in their Drawings tab. PM gets push notification.

#### Test scenario

```
✅ Upload and release a drawing:
  Step 1: Drawings tab → Upload → Select "Slab-Plan-Floor7-RevB.pdf"
  Step 2: System shows: Title = "Slab Plan Floor 7", Rev = B, Type = Structural
  Step 3: Upload → Click drawing row → Release → Select PM + Contractor
  Step 4: Confirm
  Expected: Drawing shows "Released" status. Rev A shows "Superseded".
  Verify: Log in as Contractor. Can you see the drawing? Can you see Rev A? (Yes, View-only)
  Verify: Log in as Client. Can you see it? (Only if Client was selected as recipient)
```

### 4.3 Submitting DPR (Daily Progress Report)

**Goal**: Create and submit a daily progress report with photos, weather, worker count.

**Pre-requisites**: `dpr:submit` (Site Engineer, PM).

1. Open **Sidebar → DPR**
2. Select project from dropdown
3. Fill daily entry:
   - **Notes**: Free text — what was done today
   - **Weather**: Auto-filled from API (override if needed)
   - **Worker count**: Carried from attendance
   - **Photos**: Tap to capture or upload from gallery (auto-GPS-tagged)
4. Click **Save Draft** (or **Submit DPR**)
5. If approval required: DPR goes to PM's approval queue
6. PM opens DPR → Verify → **Approve** or **Request changes**

**Result**: DPR status = Submitted (or Approved). History retained in project Timeline.

#### Test scenario

```
✅ Submit a DPR:
  Step 1: Open Sidebar → DPR → Select project
  Step 2: Write notes: "Tower B slab pour completed. Curing started."
  Step 3: Attach 3 photos → Click Submit
  Expected: DPR saved. Status = Submitted (or Pending if approval chain enabled).
  Step 4: As PM, open DPR queue → See the DPR → Click Approve
  Expected: Status = Approved. Site Engineer gets notification.
  Verify: Open Activity tab. Can you see the DPR submission in the audit log?
```

### 4.4 Managing RA Bills

**Goal**: Create a Running Account Bill from verified MB measurements, route through approval chain.

**Pre-requisites**: `rabill:create` (Contractor, PM). `rabill:approve` (PM, Project Admin).

1. **Contractor creates:**
   - Open project → **RA Bills tab** → "New RA Bill"
   - System auto-fills: linked MB rows (verified by PM) → total = sum(MB qty × BOQ rate)
   - Auto-computes: retention (5%), previously paid, payable amount
   - Add scope description → Upload signed paper invoice (optional)
   - Click **Submit**
2. **PM verifies:**
   - Opens RA Bill → Reviews linked MB rows → **Approve** or **Send back**
   - If approval chain configured: routes to next approver (e.g. Org Owner for >₹5L)
3. **Final approval:**
   - Status = Approved → Finance notified
   - PDF export with org letterhead

**Result**: RA Bill moves through: Draft → Submitted → Approved → Paid.

#### Test scenario

```
✅ Full RA Bill cycle:
  Step 1: As Contractor, open RA Bills tab → "New RA Bill"
  Expected: Auto-populated from verified MB rows
  Step 2: Submit → Status = Submitted
  Step 3: As PM, open RA Bills → See pending → Click Approve
  Expected: Status = Approved. Contractor notified.
  Verify: Print the RA Bill PDF. Does it show org letterhead? MB references? Retention?
  Verify: Check Ledger tab. Is the amount reflected in cumulative paid?
```

### 4.5 Purchase Orders

**Goal**: Create a PO, route through approval, vendor accepts, materials delivered, invoice raised.

**Pre-requisites**: `po:create` (PM, Vendor).

1. **PM creates PO:**
   - Open project → **POs tab** → "New PO"
   - Pick vendor from directory
   - Add line items from BOQ (or manual): "Cement — 200 bags @ ₹380/bag"
   - Expected delivery date
   - Click **Submit** → Routes through approval chain
2. **Approval:**
   - Small PO (<₹1L): Auto-approved
   - Medium (₹1L-5L): PM approves
   - Large (>₹5L): PM → Org Owner
3. **Vendor accepts:**
   - Vendor Portal → POs tab → See PO → **Accept** or **Decline**
4. **Delivery & Invoice:**
   - PM marks "Received" with qty + photo of bill
   - Vendor creates invoice → GST auto-computed → IRN generated
   - Invoice linked to PO + materials ledger

#### Test scenario

```
✅ Create and fulfill a PO:
  Step 1: As PM, POs tab → "New PO" → Select Vendor "Acme Cement"
  Step 2: Add line: "OPC 53 Grade Cement — 200 bags @ ₹380/bag"
  Step 3: Submit → Check if approval needed
  Step 4: As Vendor (log in as vendor@acme.com), open Vendor Portal → POs → Accept
  Step 5: Deliver → PM marks "Received" with photo
  Step 6: Vendor creates invoice → Status = Sent
  Expected: Materials ledger updates. PO status = Completed.
  Verify: Does the Ledger tab reflect +200 bags cement?
```

### 4.6 Running Labour Kiosk

**Goal**: Set up a tablet at site gate for one-tap attendance.

**Pre-requisites**: Kiosk feature enabled in Org Feature Settings.

1. **Setup:**
   - Org Admin → Features → Enable "Labour Kiosk"
   - Set tablet URL to: `https://app.sitetrack.in/kiosk/labour`
2. **Daily use:**
   - Tablet displays worker grid with photos
   - Worker walks in → Supervisor taps **Present** next to name
   - Optional: Worker scans QR code on ID card for fast attendance
3. **Reports:**
   - Labour tab → Attendance report → Export to PDF/CSV
   - Auto-calculates: man-hours, wages due, EPF/ESI deductions

#### Test scenario

```
✅ Run labour kiosk:
  Step 1: Open the kiosk URL on a tablet
  Step 2: See worker list with photos → Tap "Present" for 3 workers
  Step 3: Open main app → Project → Labour tab
  Expected: Today's attendance shows 3 workers marked present.
  Verify: Export attendance CSV. Does it show name, time, project?
```

### 4.7 Managing Org Settings

**Goal**: Configure all 10 org admin panels for your firm.

**Pre-requisites**: `org:members:manage` capability (Orgadmin).

1. **Members panel:**
   - `/org/members` → See all team members
   - "Add Member" → Email + Role → They get magic-link invite
   - Bulk CSV import: 50 members in 5 sec
   - Edit role / Deactivate (soft-delete, keeps audit history)
2. **Billing panel:**
   - `/org/billing` → Current plan info
   - "Upgrade" → Opens Cashfree UPI mandate → Approve in UPI app
   - View invoice history → Download receipts
3. **Integrations panel:**
   - `/org/integrations` → Connect external services
   - Cashfree (App ID + Secret) → Razorpay → WhatsApp Business → AI Provider
   - Each integration verified before "Active" badge
4. **Templates panel:**
   - `/org/templates` → Save current BOQ as template
   - Project template: pre-filled BOQ + team + drawings
   - New project → Pick template → 80% pre-filled
5. **Approval chains panel:**
   - `/org/approvals` → Per-resource (Expense/PO/RA Bill/Change Order/Invoice/Drawing Release)
   - Per threshold + multi-rung approval
6. **Notifications panel:**
   - `/org/notifications` → Auto-alert rules
   - Trigger: any event in audit_log_v2 → Channel: In-app/Email/WhatsApp
7. **Feature settings panel:**
   - `/org/features` → 37 toggle catalog
   - Group: Sidebar nav / Project tabs / Workflow features / Org Admin panels
   - Plan-locked features show as disabled

#### Test scenario

```
✅ Configure org settings end-to-end:
  Step 1: /org/members → Invite 1 PM, 1 Architect, 1 Contractor
  Step 2: /org/billing → Verify plan details
  Step 3: /org/approvals → Set RA Bill chain: <₹1L auto, ₹1L-5L PM, >₹5L Org Owner
  Step 4: /org/notifications → Create rule: "When RA Bill approved, notify all PMs via In-app"
  Step 5: /org/features → Toggle ON "Drawing Diff" → Toggle OFF "Labour Kiosk"
  Step 6: /org/templates → Save current project BOQ as template "Standard 4-floor residential"
  Expected: All settings save. Members get invites. New project can pick template.
  Verify: Log in as a new PM. Can they see the notification rule in action?
```

### 4.8 Running a Project — Full Lifecycle

**Goal**: Understand the complete project lifecycle from initiation to handover.

**Phase 1 — Initiation (Week 1)**
1. PM creates project → Selects type = Construction → Feature preset = Full
2. PM invites team: Architect, Site Engineer, Contractor, Client
3. Org admin sets approval chains for POs and RA Bills
4. Architect uploads tender drawings → Releases to PM + Contractor

**Phase 2 — BOQ & Budgeting (Week 2)**
1. PM or QS pastes BOQ from Excel: 50+ line items with rates
2. System computes: total budget = ₹5Cr
3. BOQ items categorised: Civil / MEP / Finishing / External
4. Org admin verifies budget → Locks BOQ (edits require approval)

**Phase 3 — Execution (Week 3-48)**
1. Site Engineer starts daily: MB measurements → Photos → DPR
2. Contractor marks labour attendance → Submits RA bills monthly
3. PM reviews MB → Verifies RA bills → Approves payments
4. Architect releases drawing revisions as work progresses
5. Materials delivered: POs → Vendor delivers → Inventory updated
6. Issues logged and resolved: Safety incidents, quality defects, RFIs

**Phase 4 — Handover (Week 49-52)**
1. Punch list created: 15 defects found → Assigned to contractor
2. Compliance docs filed: RERA stage filings, permits renewed
3. Handover packet prepared: As-built drawings, warranties, O&M manuals
4. Client reviews → Digital sign-off → Project status = Completed

#### Test scenario

```
✅ Simulate full lifecycle:
  Step 1: Create project → Set type = Construction
  Step 2: Add BOQ (paste 10 items from Excel)
  Step 3: Upload 1 drawing → Release to PM + Contractor
  Step 4: Add 3 MB measurements → Submit RA Bill → Approve
  Step 5: Add 1 issue → Assign to contractor → Resolve
  Step 6: Mark project status = Completed
  Expected: Every step recorded in audit log. Full paper trail.
  Verify: Open Activity tab. Can you see all 6 events? Export to CSV.
```

### 4.9 Handover & Compliance

**Goal**: Prepare project handover packet, file RERA compliance, get client sign-off.

**Pre-requisites**: `handover:view`, `handover:sign` (PM, Client, Project Admin).

1. **Compliance filings:**
   - Open project → **Compliance tab**
   - RERA: Click "File stage" → Select stage (Foundation/Plinth/...) → Auto-fills from BOQ progress → Submit to state RERA portal
   - Permits: Upload permit docs → Set expiry → Auto-reminder 30 days before
   - GSTN: Auto-generate IRN for B2B invoices
2. **Handover packet:**
   - Open **Handover tab**
   - System collects: As-built drawings, material warranties, O&M manuals, test certificates
   - Generate ZIP: All docs in one downloadable packet
3. **Client sign-off:**
   - Client logs in → Opens Handover tab → Reviews all docs
   - Clicks **"Approve Handover"** → Digital signature
   - Project status auto-updates to "Completed"

#### Test scenario

```
✅ Complete handover:
  Step 1: Compliance tab → Upload RERA stage filing → Submit
  Step 2: Permits → Upload Occupancy Certificate → Set expiry
  Step 3: Handover tab → Generate packet → Download ZIP
  Step 4: As Client, log in → Open project → Handover tab → Review → Sign off
  Expected: Project status = Completed. Client signature stored in audit log.
  Verify: Open audit log. Can you see: RERA filing, permit upload, handover approval?
```

### 4.10 Analytics & Reports

**Goal**: View cross-project analytics, budget tracking, export reports.

**Pre-requisites**: `budget:view` (PM, Orgadmin, Project Admin, Promoter).

1. **Analytics dashboard:**
   - Open **Sidebar → Analytics**
   - Cross-project charts: Budget vs spent per project, RA Bill trend, Labour count by month
   - Filter by date range, project, status
2. **Activity log:**
   - `/activity` → Full audit log across all projects
   - Filter by: Actor, Action, Resource, Date range
   - Export to CSV → Export to PDF (with org letterhead)
3. **Budget reports:**
   - Project → Overview tab → Budget vs Spent bar
   - Overrun alert if >5% above BOQ
   - Export BOQ to PDF/Excel for client sign-off
4. **Export options everywhere:**
   - Every tab has Export button: CSV (data) or PDF (formatted with letterhead)

#### Test scenario

```
✅ Run analytics:
  Step 1: /analytics → View budget vs spent chart → Apply date filter
  Step 2: Click Export → CSV downloads
  Step 3: /activity → Filter by "RA Bill approved" → Click Export PDF
  Expected: PDF generated with org letterhead, shows all RA Bill approvals this month.
  Verify: Open the PDF. Does it show: date, actor, amount, project name?
```

---

## 5. Kiosk Mode Guide

SiteTrack offers 4 kiosk modes for single-purpose screens at site.

### 5.1 Labour Attendance Kiosk

**Purpose**: Tablet at site gate for one-tap clock-in/out.

**Setup:**
1. Org Admin → Features → Enable "Labour Kiosk"
2. Set tablet URL: `https://app.sitetrack.in/kiosk/labour`
3. PIN-locked: Can't exit without 4-digit PIN

**Daily use:**
- Worker grid with photos shown
- Supervisor taps "Present" / "Absent"
- Optional: QR scan on ID card for fast attendance
- Real-time sync: PM can see who's on site right now

**Test scenario:**
```
✅ Kiosk attendance:
  Step 1: Open kiosk URL on tablet → PIN screen appears
  Step 2: Enter PIN → See worker grid
  Step 3: Mark 5 workers Present → Exit kiosk
  Step 4: Main app → Labour tab → Today's attendance shows 5 present
  Verify: Can you export today's attendance as CSV?
```

### 5.2 Site Wall Kiosk

**Purpose**: Wall-mounted TV in site office showing live project status.

**Setup:**
- URL: `https://app.sitetrack.in/kiosk/site-wall`
- No interaction needed — passive display

**Display:**
- Rotates 4 dashboards every 30 sec:
  1. Progress (BOQ completion %)
  2. Safety (days since last incident)
  3. Weather (auto-fetched)
  4. Today's DPR (latest update)

### 5.3 Daily Snapshot

**Purpose**: Single-page project status summary.

**URL**: `https://app.sitetrack.in/kiosk/snapshot`

**Shows:**
- Labour count today
- Updates count today
- Open issues count
- Material received today

### 5.4 AR Drawing Overlay

**Purpose**: Preview — Hold phone at site, overlay drawing on camera view.

**Status**: Scaffolded (not production ready). Requires WebXR.

---

## 6. Admin Console Guide

Platform admin (superadmin) views for managing the entire SaaS.

### 6.1 Platform Dashboard (`/admin`)

- Multi-tenant MRR chart
- Active orgs/users count
- Plan distribution pie chart
- Recent signups list
- Churn risk alerts
- Cross-tenant activity feed

### 6.2 Organizations (`/admin/orgs`)

- All customer orgs with status (active/suspended/trial)
- Add org → Name + admin email + plan
- Click org → see: member count, project count, subscription status, last activity
- Change plan / Suspend / Delete

### 6.3 Users (`/admin/users`)

- Cross-tenant user list
- Search by name/email/org
- Invite user to any org
- Impersonate: Click user → See their view → Debug → Stop
- Status toggle per user

### 6.4 Roles (`/admin/roles`)

- View all 22 roles and their capabilities
- Configure role permissions
- Custom roles panel: Create org-specific role variants

### 6.5 Signups (`/admin/signups`)

- Pending signup requests
- Approve → Org created, user notified
- Reject → Reason sent to applicant

### 6.6 Staff (`/admin/staff`)

- Staff tier management: Owner / Head / Member
- Staff area grants: signups, orgs, users, roles, upgrades
- View staff activity log

### 6.7 Upgrades (`/admin/upgrades`)

- Upgrade requests from orgs
- Process: verify payment → plan changed → org notified

### 6.8 Branding (`/admin/branding`)

- Platform-wide branding settings
- Logo, accent color, theme
- White-label options for Business plan orgs

---

## 7. Troubleshooting

### 7.1 Login Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Magic link invalid | Gmail prefetched the URL | Use 6-digit code from email body instead |
| OTP not received | Email in spam, or wrong email | Check spam, retry with correct email |
| "Local mode" shown | VITE_BACKEND not set to supabase | Deployer: check Vercel env vars |

### 7.2 Permission Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Can't see Org Admin gear | You're not org_admin/org_owner | Ask Org Owner to promote you |
| Can't see a project | You're not a member of that project | Ask PM to add you via Project Settings → Members |
| Button greyed out | Feature disabled in Org settings, or plan limit reached | Check Org Features panel / Upgrade plan |
| "Access denied" toast | Your role lacks this capability | Refer to §8 Quick Reference for your role |

### 7.3 Data Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Photos not uploading | File >10MB or weak network | App auto-resizes. Try smaller batch (5 at a time) |
| Offline changes not syncing | App thinks it's offline | Pull-to-refresh on mobile, reload on desktop. Check green connectivity pill |
| Demo data missing | localStorage quota exceeded | Clear browser data → Reload → "Load demo data" again |

### 7.4 App Crashes

| Problem | Fix |
|---------|-----|
| "Something broke" error screen | Click "Reload" — usually fixes it |
| Recurring crash | Click "Reload and clear data" (wipes cache, server data safe) |
| Report a bug | Profile → Help → Report, or email hello@sitetrack.in |

---

## 8. Quick Reference

### 8.1 Role → Capability Summary

| Role | Capabilities | Key access |
|------|-------------|------------|
| superadmin | All 90 | Everything, including impersonation |
| orgadmin | ~23 | Org panels: members, billing, integrations, templates, approvals, features |
| promoter | ~28 | DPR view, digest, budget/ledger view, compliance view, handover, export |
| project_admin | ~32 | Compliance, RERA/GSTN/EPFO filing, invoice/rabill, milestone, vendor |
| prospector | ~2 | Project create, vendor manage |
| pm | ~36 | Project CRUD, progress, milestones, DPR, team, attendance, materials, POs, RFI, BOQ, rabills, drawings, messages, export |
| architect | ~13 | Drawings upload/release/markup, RFI, change orders, BOQ edit, updates |
| senior_architect | ~18 | Same as architect + team manage, RFI close, change orders approve |
| junior_architect | ~6 | Drawings upload/edit/markup, RFI create, updates |
| design_architect_int | ~12 | Drawings, materials, RFI, BOQ |
| design_head | ~14 | Same + team manage, RFI close, change order approve, estimate edit |
| consultant_head | ~8 | Drawings edit/markup, RFI respond/close, change order approve |
| designer | ~4 | Drawings upload/markup, updates |
| mep_consultant | ~11 | Drawings, RFI, change orders, inspections |
| structural_consultant | ~11 | Same as MEP |
| consultant | ~5 | Drawings markup, RFI, updates |
| site_engineer | ~23 | Progress, updates, issues, punchlist, safety, attendance, labour, materials, DPR, drawings markup |
| contractor | ~8 | Updates, attendance, materials, RFI, RA bills |
| sub_contractor | ~5 | Updates, attendance, RFI |
| vendor | ~4 | POs, invoices, material prices |
| client | ~7 | DPR view, compliance view, handover, share portal, export |
| site_inspector | ~6 | Compliance view, audit read, drawings markup, RERA file, export |

### 8.2 Route Map

| Path | Component | Feature |
|------|-----------|---------|
| `/` | LandingView | Public landing page |
| `/login` | LoginScreenV3 | Sign in |
| `/signup` | SignupView | Register |
| `/dashboard` | RoleDashboard | User's home |
| `/projects` | ProjectsListView | All projects |
| `/projects/new` | CreateProjectView | New project form |
| `/projects/:id` | DetailView | Project detail (17 tabs) |
| `/dpr` | DPRComposer | Daily Progress Report |
| `/vendors` | VendorsView | Vendor directory |
| `/calendar` | CalendarView | Project calendar |
| `/analytics` | AnalyticsView | Cross-project charts |
| `/search` | GlobalSearchView | Global search |
| `/pos` | CrossProjectPOsView | All purchase orders |
| `/notifications` | NotificationsView | Notification inbox |
| `/activity` | OrgActivityView | Audit log |
| `/org` | OrgDashboardView | Org admin home |
| `/org/members` | OrgMembersView | Team management |
| `/org/billing` | OrgBillingView | Subscription |
| `/org/templates` | OrgTemplatesView | Reusable templates |
| `/org/integrations` | OrgIntegrationsView | External services |
| `/org/approvals` | OrgApprovalsView | Approval chains |
| `/org/notifications` | OrgNotificationsView | Alert rules |
| `/org/features` | OrgFeatureSettingsView | Feature toggles |
| `/admin` | PlatformDashboardView | Superadmin home |
| `/admin/orgs` | PlatformOrgsView | Manage orgs |
| `/admin/users` | PlatformUsersView | Manage users |
| `/admin/roles` | RoleManager | Role permissions |
| `/admin/signups` | SignupRequestsView | Approve signups |
| `/admin/upgrades` | UpgradeRequestsView | Plan upgrades |
| `/admin/staff` | StaffAdminView | Staff management |
| `/settings/security` | SecurityView | Password, MFA |
| `/settings/profile` | ProfileView | User profile |

### 8.3 Plan Limits

| Feature | Free (14d trial) | Pro (₹999/mo) | Business (₹2,999/mo) |
|---------|-----------------|---------------|----------------------|
| Projects | 1 | 5 | 50 |
| Users | 5 | 25 | 100 |
| Storage | 1 GB | 20 GB | 100 GB |
| RERA filing | No | No | Yes (state portals) |
| WhatsApp DPR | No | Yes | Yes |
| Audit blockchain anchor | No | No | Yes |
| Support | Email | 24 hr | 8 hr + named CSM |
| Team training | No | No | 2-hr Zoom onboarding |

---

## 9. Test Your Knowledge

Scenario-based questions. Try to answer without looking at the guide.

### Role questions

**Q1**: You log in and see the Org Admin gear icon. What role are you?
- A) superadmin or orgadmin (only these see Org Admin)

**Q2**: A Contractor says they can't create an RA Bill. What could be wrong?
- A) No MB entries verified by PM yet, or their role doesn't have `rabill:create` (but contractor does have this — check if they're actually assigned as Contractor in org_members)

**Q3**: A Client reports they can see a project but all tabs are empty. Why?
- A) Client only sees released drawings and submitted DPRs. If nothing has been released/submitted, tabs are empty.

**Q4**: As PM, you uploaded a drawing but the Contractor can't see it. Why?
- A) Did you click "Release" and select Contractor as recipient? Unreleased drawings are invisible to non-uploaders.

**Q5**: You're orgadmin but the "RERA Filing" button is greyed out. What's wrong?
- A) Your org is on Pro plan. RERA filing requires Business plan. Or the feature is toggled OFF in Org Features.

### Feature questions

**Q6**: An RA Bill shows amount = ₹85,000 but payable = ₹80,750. Where did ₹4,250 go?
- A) 5% retention. Auto-computed by the system.

**Q7**: A Site Engineer entered measurements in MB but the Contractor says MB shows "Unverified". What step is missing?
- A) PM needs to verify and digitally sign the MB entries before they link to RA Bills.

**Q8**: You want to be notified when a drawing is released. How do you set this up?
- A) Org Admin → Notifications → Create rule: Trigger "Drawing released" → Channel: In-app → Recipients: Role = PM

**Q9**: A Vendor portal user says they can see POs from two different companies. Is this a bug?
- A) Yes — vendors should only see POs from their own org. Check RLS policies.

### Debug questions

**Q10**: An orgadmin reports that the "New Project" button is missing. They are orgadmin which has `project:create` = false. True or false?
- A) True. Orgadmin does NOT have `project:create`. PM, Prospector, and Project Admin do. The orgadmin needs to either assign themselves PM role in a project or ask a PM to create projects.

**Q11**: After inviting a new user with magic link, they say "Link expired". What happened and what's the fix?
- A) Gmail prefetched the URL. Fix: Use the 6-digit OTP code from the email body instead.

**Q12**: A PM created a PO for ₹12L but it was auto-approved instantly even though the org has approval chains configured. Why?
- A) Check if approval chains are configured for "PO" resource specifically, and whether the threshold rules cover ₹12L. If no rule matches, it may fall through to auto-approve.

---

*SiteTrack Pro · Made in Hyderabad for Indian builders · 2026*
*Last updated: June 2026 · Maintainer: Mohan Boyapati*
