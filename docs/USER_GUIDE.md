# SiteTrack Pro — User Guide

> Indian builders ki construction management software. Site nundi office daaka — every drawing, every measurement, every rupee tracked in one place.
>
> **Live at**: [https://sitetrack-rakesh.vercel.app](https://sitetrack-rakesh.vercel.app) (will move to `app.sitetrack.in` soon).

---

## 📖 Table of Contents

1. [Quick Start (5 min)](#1-quick-start-5-min)
2. [Core Concepts — antha first ardham chesko](#2-core-concepts)
3. [Sign In — 3 ways](#3-sign-in--3-ways)
4. [Choose Your Project Type](#4-choose-your-project-type)
5. [Your First Project — Step-by-Step](#5-your-first-project)
6. [Daily Workflows by Role](#6-daily-workflows-by-role)
7. [The 17 Project Sub-tabs — Deep-dive](#7-the-17-project-sub-tabs)
8. [9 Org Admin Panels](#8-9-org-admin-panels)
9. [Mobile Field Worker Mode](#9-mobile-field-worker-mode)
10. [Kiosk Modes — Labour Gate + Site Wall](#10-kiosk-modes)
11. [Integrations](#11-integrations)
12. [Settings & Preferences](#12-settings--preferences)
13. [Troubleshooting](#13-troubleshooting)
14. [Telugu / Hindi UI](#14-telugu--hindi-ui)
15. [Glossary](#15-glossary)
16. [FAQs](#16-faqs)

---

## 1. Quick Start (5 min)

### What you'll do
- Sign up
- Pick your role
- See your dashboard
- (Optional) load demo data to explore

### Steps

1. Open: **https://sitetrack-rakesh.vercel.app** in any browser (Chrome / Safari / Edge — works on phone too)
2. You'll see the **Welcome back** login screen
3. **Pick one of 3 paths**:

   **Path A — Magic link (real production sign-up)**:
   - Type your work email in the box
   - Click **"Send sign-in link"**
   - Check your inbox (also Spam folder)
   - **If you use Gmail**: copy the 6-digit code from the email + paste into the OTP box (Gmail prefetch sometimes "burns" the link)
   - You're logged in as a new user with read-only `client` role

   **Path B — Demo mode (5 orgs, 4 projects pre-loaded)**:
   - Click **"Load demo data"** button at the bottom
   - Wait ~2 sec
   - Click any role card (Architect / PM / Contractor / etc.)
   - Click **"Continue as..."** orange button
   - You're inside the demo workspace with rich data to explore

   **Path C — Demo role only (no real data)**:
   - Click any role card
   - Click **"Continue as..."**
   - You're in an empty workspace as that role

### What you should see
- **Sidebar on left** (desktop) or **bottom tab bar** (mobile) with: Dashboard / Projects / Calendar / Messages / Notifications
- **Greeting top-right**: "Good morning, [name]"
- **4 stat tiles**: Projects Open / Issues Open / RA Bills Pending / Labour Active
- **Quick-action buttons**: New project / Mark attendance / Daily update / Send DPR
- **Recent updates feed** below

✅ You're now using SiteTrack Pro. Read on for deep details.

---

## 2. Core Concepts

Mundu ee 6 concepts ardham chesko. Without these, the rest of the app feels random.

### 2.1 Org (Organization)

**What**: Your builder firm (e.g. "Greenfield Developers", "ABC Constructions Pvt Ltd").

**Why it exists**: SiteTrack is multi-tenant — your firm's data is completely isolated from other firms. Even SiteTrack support staff can't see your data without explicit permission.

**Who creates it**: The first person who signs up from your firm becomes the Org Owner. They invite everyone else.

### 2.2 Project

**What**: One construction site (e.g. "Green Valley Phase II", "Skyline Tower").

**Inside a project**: 17 sub-tabs of data — BOQ, RA Bills, Drawings, Labour, etc.

**Project Type** (you choose at creation):
- **Construction** — high-rise / commercial / villa work · all 17 tabs visible
- **Interior** — fit-out / renovation · 12 tabs (no MB, no Labour, no Safety)
- **Design** — architecture-only firm · 8 tabs (Drawings + Submittals + Quality + …)
- **Consultant** — audit / PMC / QS · 6 tabs (cross-project, no team management)

### 2.3 Role

**What**: Your job inside SiteTrack. Determines what you see + what you can change.

**19 roles**:
- **Platform**: `superadmin` (us), `support` (us)
- **Org owners**: `org_owner`, `org_admin`, `org_finance`, `project_admin`
- **Field**: `pm`, `site_engineer`, `civil_engineer`, `mep_consultant`, `site_inspector`, `project_head`
- **Architect**: `architect` (junior/senior/principal seniority), `design_architect_interior`
- **Designer**: `interior_designer`, `designer`, `consultant`, `principal_consultant`
- **Contractor**: `contractor`, `sub_contractor`
- **External**: `client`, `vendor`

### 2.4 BOQ (Bill of Quantities)

**What**: Itemised budget. Line by line: "RCC slab — 12.5 cum @ ₹5,200 = ₹65,000".

**Why**: Without BOQ, you can't bill, can't track material, can't compute progress.

**In SiteTrack**: Excel file paste cheyochu (we parse it), or add items manually. BOQ saved per project.

### 2.5 MB → RA Bill cycle

**MB (Measurement Book)**: Statutory append-only register. "On 15-Apr, measured slab at Tower A Floor 7 = 4.2m × 3.1m × 0.15m = 1.95 cum". Linked to BOQ items.

**RA Bill (Running Account)**: Sub-contractor invoice = sum of MB entries × BOQ rate − retention.

**Cycle**:
1. Site engineer enters MB row (drag photo, GPS auto-tagged)
2. PM verifies + signs
3. MB entries flagged for RA bill
4. Contractor submits RA bill (auto-totaled from MB)
5. PM approves
6. Finance pays
7. Audit log records every step (immutable)

**Why this matters**: PWD spec + RERA + court disputes all need this exact paper trail. Procore + Powerplay don't have this.

### 2.6 Audit log v2

**What**: Every change (create/update/delete/approve/release/payment) is logged with:
- Who (actor + role)
- When (timestamp)
- What (resource + before + after)
- Why (optional message)

**Append-only**: Cannot be edited or deleted, even by the superadmin. Hashed daily into a Merkle tree → optionally anchored to Polygon blockchain → court-admissible per IT Act 2000 s.65B.

---

## 3. Sign In — 3 Ways

### 3.1 Magic Link (production users)

1. Enter your work email
2. Click "Send sign-in link"
3. Check inbox → click the button OR copy the 6-digit code → paste in OTP field
4. You're in

**Gmail issue**: Gmail's malware scanner prefetches every URL in every email. This sometimes "uses up" the link before you click. Workaround: use the 6-digit code in the email body instead — Gmail can't auto-use those.

### 3.2 OTP Code (Gmail-safe fallback)

After sending magic link → scroll to bottom of email → find 6-digit code → enter in the OTP input → click "Sign in".

### 3.3 Demo Role (instant, no email)

Click any role card on login screen → "Continue as [role]" → you're inside with mock data. Used for demos, training, testing UI.

⚠️ Demo data lives in browser localStorage. Closing the browser may lose it (depending on Org's `demoModePermanent` setting).

---

## 4. Choose Your Project Type

Project creation lo first decision. Determines what tabs you see.

```
┌─────────────────┬──────────────────────────────────────────────────┐
│ CONSTRUCTION    │ Residential / commercial / villa building work   │
│                 │ 17 tabs · BOQ + MB + RA Bills + Labour visible   │
│                 │ Best for: Apartment builder, commercial developer│
├─────────────────┼──────────────────────────────────────────────────┤
│ INTERIOR        │ Fit-out / renovation                              │
│                 │ 12 tabs · No MB, no Labour, no Safety            │
│                 │ Best for: Designer firms, renovation contractors │
├─────────────────┼──────────────────────────────────────────────────┤
│ DESIGN          │ Pure design (no construction execution)         │
│                 │ 8 tabs · Drawings + Submittals + Quality only   │
│                 │ Best for: Architecture-only firms                │
├─────────────────┼──────────────────────────────────────────────────┤
│ CONSULTANT      │ Audit / PMC / QS (cross-project oversight)       │
│                 │ 6 tabs · Inspections + Submittals + Audit only  │
│                 │ Best for: Independent PMC, QS firms              │
└─────────────────┴──────────────────────────────────────────────────┘
```

You can change project type later (Settings → Project → Type), but tabs will hide/show accordingly.

---

## 5. Your First Project — Step-by-Step

### 5.1 As Org Owner (first sign-in)

After magic-link login, you'll see an **Onboarding Wizard** (5 steps):

**Step 1: Tell us about your firm**
- Firm name (e.g. "Greenfield Developers Pvt Ltd")
- GSTIN (we verify against GSTN portal)
- PAN
- Registered address
- Logo upload (optional — sets your white-label PDF letterhead)

**Step 2: Invite your team**
- Add by email
- Assign role (we suggest based on email domain)
- They get a magic-link invite
- OR bulk CSV upload (50 members in 5 sec)

**Step 3: Create your first project**
- Project name
- Site address (we auto-geocode for the map view)
- Start date + expected end date
- Budget (₹ — used as the BOQ baseline)
- Client name + email (they get read-only access automatically)
- **Project type** (the 2×2 picker from §4)

**Step 4: Feature preset**
- Lite (just essentials — Overview / Tasks / Updates / Drawings / BOQ)
- Standard (recommended — all the above + RA Bills + Labour + Vendors)
- Full (all 37 features — only if your firm uses everything)

**Step 5: Connect integrations** (optional)
- Cashfree (for billing)
- WhatsApp Business (for daily progress reports to client)
- AI provider (OpenAI / Anthropic — for forecasting + Telugu/Hindi DPR summaries)

Done. You land at the Dashboard with your project visible.

### 5.2 Quick "skip the wizard" path

If you want to jump in: **Sidebar → Projects → New project** → fill 5 fields → Save.

---

## 6. Daily Workflows by Role

### 6.1 Architect (typical day)

**Morning** (10 AM, office):
1. Open SiteTrack → Dashboard shows: 3 RFIs pending you, 1 drawing requested by PM, 2 issues @ Site B
2. Click **Drawings** tab on Project Skyline Tower
3. Upload Rev B of "Slab Plan — Tower A Floor 7" (drag PDF + auto-extracts metadata)
4. Click **"Release to: PM, Contractor, Client"**
5. Old Rev A auto-flips to "Superseded" + history retained
6. PM gets push notification within 2 sec
7. Client gets WhatsApp message (if WhatsApp integration on)
8. Audit log records the release with your signature

**Mid-day** (12 PM, between meetings):
1. Open **RFIs** tab → 3 RFIs waiting your reply
2. Click first: "What's the structural rebar spec for 12th floor?"
3. Type response + upload reference drawing
4. Click "Resolve" → contractor gets notified
5. Repeat for next 2

**Afternoon** (3 PM, site visit):
1. Open SiteTrack on phone
2. Bottom tab → **Updates**
3. Tap **"Quick capture"** → camera opens
4. Snap 4 photos of slab finish at Tower B
5. App auto-tags: GPS, time, project, your name
6. Type: "Tower B Floor 5 — slab pour 80% done. Curing started 3 PM."
7. Save → uploads when 4G connects again (offline-first)

**End of day** (6 PM, office):
1. Open **Activity** feed → see all changes today
2. Click **"Export PDF"** for client weekly report
3. Letterhead auto-applied (org branding)
4. PDF emailed to client

### 6.2 Project Manager (PM) — typical day

**Morning** (8 AM, site):
1. Open SiteTrack on phone
2. **Quick capture** → take 5 photos of work-in-progress
3. **Attendance** → mark 47 workers present
4. **Materials** → 80 bags cement received from Acme Vendor → check delivery photo

**Mid-day** (1 PM):
1. **MB tab** → site engineer added 6 entries
2. Tap each → verify with photo from yesterday
3. Sign with finger on phone (digital signature) → MB rows now "Verified"
4. PM dashboard shows: ₹4.8 L worth of work measured this week

**Afternoon** (4 PM, office):
1. **RA Bills** tab → contractor submitted RA Bill #7 for ₹3.2 L
2. SiteTrack auto-shows: linked MB rows + retention deduction + cumulative
3. Click "Approve" → contractor + finance both notified
4. Audit log records approval with your sign

**End of day** (6 PM):
1. **Updates** → write today's daily diary (auto-fills weather from API)
2. **Send to client via WhatsApp** → button click → 4-paragraph Telugu summary auto-generated by AI → previewed → sent

### 6.3 Site Engineer — typical day

**Whole day on site** (tablet / phone):

1. 6 AM — open SiteTrack offline → review yesterday's MB rows
2. 10 AM — take measurements: slab thickness, column dimensions, plaster area
3. Enter in MB tab — photos auto-attach with GPS + timestamp
4. 12 PM — log materials inward (cement received from Acme: 80 bags)
5. 2 PM — issue popup: scaffolding damaged at Tower B → tap "Report Issue" → photo → high severity → assign to safety officer
6. 4 PM — check punch list (defects near handover) → tap to add 3 items
7. 5 PM — log labour worklog: 25 helpers × 8 hr × ₹600 = ₹1.2 L
8. 6 PM — sync (auto when WiFi connects)

All works **offline-first**. Everything queues locally, syncs when network available.

### 6.4 Contractor — typical day

**Morning** (9 AM):
1. **Worklogs** tab → log yesterday's work: "20 masons × 8 hr at Tower A Plinth"
2. **POs** tab → see new PO from PM for 200 bricks @ ₹8 each
3. Tap "Accept" → confirmed → vendor gets notified

**Afternoon** (3 PM):
1. **MB tab** → see PM verified your measurements: 4 rows worth ₹85,000
2. Go to **RA Bills** tab → "New RA bill"
3. SiteTrack pre-fills: linked MB rows = ₹85,000, retention 5% = ₹4,250, payable = ₹80,750
4. Add scope description, upload signed paper invoice (if needed)
5. Submit → PM notified

**End of week**:
1. Check **Ledger** tab → see cumulative this month: ₹4.2 L billed, ₹3.8 L paid
2. **Activity** tab → see PM's approval comments

### 6.5 Client — typical day

**Read-only access**:
1. Login → see "Your projects" (only ones with your email as client_email)
2. **Dashboard** → progress %, money spent vs budget, milestones hit
3. **Updates** tab → scroll daily updates with photos
4. **Drawings** → see only released drawings (no work-in-progress)
5. **Activity** → audit log filtered to released info

Get **daily WhatsApp summary** from your builder (if they enabled WhatsApp). No need to log in often.

### 6.6 Org Admin (firm owner) — weekly cadence

**Monday morning**:
1. **Sidebar → Org Admin (gear icon)**
2. **Members** panel → review who joined / left this week
3. **Billing** → check Cashfree subscription status, MRR
4. **Activity** → full org audit (every action across all projects)
5. **PDF export** of weekly audit → letterhead applied → board email

**Friday end-of-day**:
1. **Feature Settings** → toggle ON/OFF features per team feedback
2. **Approval Chains** → adjust who can approve RA bills > ₹10 L
3. **Templates** → save current BOQ as a template for next project

---

## 7. The 17 Project Sub-tabs

Each project has up to 17 tabs. Visibility depends on:
1. Your **role** (PERMS)
2. Org's **feature flags** (37-toggle catalog)
3. Project **type** (Construction sees all, Design sees 8)

### 7.1 Overview tab

**Always first**. Shows:
- Big project name + status pill (Active / On Hold / Completed)
- Progress % bar (computed from BOQ + MB measurements)
- Budget vs Spent (with overrun alert if >5%)
- Milestone timeline (Gantt strip)
- Recent activity (last 10 events)
- Quick actions: New update / New issue / New material entry

### 7.2 Tasks tab

To-do management per project.

- Add task → title + assignee + due date + priority
- Group by milestone OR by trade
- Bulk import from Excel
- Recurring tasks (daily standup, weekly review)
- Filter: assigned to me / overdue / due today

### 7.3 Updates tab (DPR — Daily Progress Report)

Heart of the app for field workers.

- Add update → 4 fields: notes + weather + worker count + photos
- Photos auto-tag: GPS coords + capture timestamp + uploader
- 📸 Tip: take photos through SiteTrack camera (not Gallery) for cleaner metadata
- WhatsApp button: send today's summary to client phone with 1 click
- Filter by date range, author, or tag (#scaffolding, #electrical)
- Daily Progress Report (DPR) generator: AI summarises today's photos+notes in 4 paragraphs (Telugu/Hindi/English)

### 7.4 Materials tab

Material delivery + tracking.

- Add material → expected delivery from Vendor → date
- When received: mark "Received" + qty + photo of bill
- "Rejected" status if quality bad → vendor notified
- Stock ledger view: live count of cement/steel/aggregate on site
- Tip: link to BOQ — auto-flag when consumption exceeds BOQ estimate

### 7.5 Vendors tab

Vendor master + ratings.

- Add vendor → name + GSTIN + phone + category (steel / cement / labour contractor)
- GSTN check auto-verifies the GSTIN
- 5-star rating after each delivery → average shown on card
- Past contracts history → quick reference
- **Org-level** — shared across all projects in your org

### 7.6 POs (Purchase Orders) tab

PO lifecycle.

- Create PO → pick vendor + line items from BOQ + qty + delivery date
- Approval chain (per Org Admin config) — small PO auto-approved, big PO needs PM + Finance
- Vendor portal sees the PO → accepts / declines
- On delivery: link to inventory ledger
- Print PO with org letterhead

### 7.7 Invoices tab

Vendor invoices (incoming).

- Track invoice received from vendor
- GST + TDS auto-computed
- Payment status: Sent / Paid / Overdue
- Link to PO + Materials
- Export to Excel for accountant

### 7.8 BOQ (Bill of Quantities) tab

The line-item budget.

- Paste-from-Excel → we parse: code + description + unit + qty + rate → bulk import
- Manual add row by row
- Category: Civil / MEP / Finishing / External / Other
- Auto-total per category + grand total
- Edit history per row (audit log)
- Export to PDF/Excel for client signoff

### 7.9 RA Bills (Running Account Bills) tab

Contractor running invoices.

- Create RA bill → auto-link to MB measurements + BOQ rates
- Auto-compute: bill amount = sum(MB qty × BOQ rate) − retention − previously paid
- Approval workflow → PM signs → Finance pays
- Audit log records every transition
- Print RA bill with org letterhead
- Cumulative tracker shown on card (₹X.X L of ₹Y.Y L paid)

### 7.10 Measurement Book (MB) tab

Statutory append-only ledger of site measurements.

- Add row → description + location + qty (with L × B × D fields if cuboid)
- Link to BOQ item (one click, dropdown)
- Photos auto-attached
- PM verifies + digital signature
- Cannot edit/delete after RA bill linked (drift trigger fires → audit log)
- MB number serialisation (statutory format MB-2026-007)
- Export to PDF (for PWD audit)

### 7.11 Labour tab

Statutory labour register (statutory PWD format).

- Add labour entry → name + Aadhaar (masked in UI) + EPF / ESI numbers + trade + wage + date joined
- Bulk import from CSV
- Aadhaar shown as `XXXX XXXX 1234` (last 4 digits only)
- EPF/ESI auto-format verified
- Reports: per trade, per pay-period, monthly PF filing prep
- Export EPFO-compatible XML (in development)

### 7.12 Ledger tab

Live inventory ledger (cement, steel, aggregate, etc.).

- Auto-populated from Materials tab "received" events
- Auto-decreases when "issued to work" entries logged
- Reconciliation view: physical count vs system count
- Wastage tracking — flag > 5% wastage rate
- Material price master from Vendors / market scrapes

### 7.13 Drawings tab

CAD + PDF drawing management with revision chain.

- Upload PDF / DWG / DXF / JPG
- Auto-detect title + type from filename
- Revision auto-increments (Rev A → Rev B → ...)
- Release flow: pick recipients (PM / Contractor / Client) → they see only released revisions
- **Drawing-diff viewer** (just shipped): pick Rev A + Rev B → overlay with opacity slider → see what changed
- Markup canvas: draw on top with red pen → save as new version
- Storage path immutable → drawings never lost
- Past revisions retained forever (legal requirement)

### 7.14 Quality tab

Inspections + checklists.

- Schedule inspection → type (structural / MEP / safety / handover) + date + inspector
- Run inspection → checklist items: Pass / Fail / NA
- Photos per item
- Outcome: Pass / Fail / Conditional
- Follow-up items auto-created as Tasks
- Inspection report PDF generator

### 7.15 Safety tab

Site safety incidents + reports.

- Log incident → severity (Near-miss / First-aid / Minor / Major / Fatal) + photo + description
- Action taken + follow-ups
- Monthly safety report (counts by severity)
- LTIFR (Lost-Time Injury Frequency Rate) calculated
- Escalation: Major+ incidents auto-notify Org Owner

### 7.16 Permits tab

Government permits + statutory clearances.

- Add permit → kind (Environment / Commencement / Occupancy / Fire / Electrical / RERA stage) + ref no + issuing authority + valid till
- Document upload (scan of original)
- Auto-reminder 30 days before expiry
- RERA filings: per-stage progress filed to Telangana / Karnataka / Maharashtra portals (where enabled)

### 7.17 Submittals tab

Drawings + specs awaiting client/consultant approval.

- Submit → type (shop drawing / material sample / method statement) + drawing reference + reviewer role
- Reviewer sees in their queue
- Status: Pending / Approved / Approved with comments / Rejected / Resubmit
- Audit log all reviews

### 7.18 Equipment tab

Heavy machinery + tools.

- Add equipment → name + asset # + type + ownership (Owned / Rental / Hire)
- Rate per day for cost computation
- On-site from/to dates
- Maintenance schedule (last serviced + next due)
- Operator name
- Meter reading (hours/km)

### 7.19 Diary tab

Site diary — one entry per (project, date).

- Auto-fills weather from API
- Worker count carried from Attendance tab
- Free text for events of the day
- Visitor log
- Safety notes
- Tomorrow's plan
- Photos attached

Daily routine for site engineers — replaces the paper site diary mandated by some specs.

---

## 8. 9 Org Admin Panels

Behind the gear icon (top-right of sidebar). Only org_admin + org_owner + superadmin see these.

### 8.1 Members

- See all team members
- Add member: email + role
- Edit role
- Deactivate (soft-delete; keeps audit history)
- Bulk CSV import — 50 members in 5 sec
- Search + filter by role

### 8.2 Approval Chains

Configure who approves what.

- Per resource (Expense / PO / RA Bill / Change Order / Invoice / Drawing Release)
- Per threshold (e.g. PO < ₹1L → auto, ₹1L-5L → PM, > ₹5L → Org Owner)
- Add rungs (multiple approvers in series)
- Per rung: require signature? Require comment?

### 8.3 Templates

Reusable templates for new projects.

- **Project template**: pre-filled BOQ + team + drawings
- **BOQ template**: full BOQ for a class of project (e.g. "Standard 4-floor residential")
- **Checklist template**: inspection checklists

When creating new project, pick a template → 80% pre-filled.

### 8.4 Integrations

Connect external services.

- **Cashfree** (UPI AutoPay billing) — paste App ID + Secret
- **Razorpay** (alternative payment gateway)
- **WhatsApp Business** (Meta Cloud API for client DPRs)
- **OpenAI / Anthropic** (for AI forecasting + DPR summaries)
- **Slack / Teams** (notifications, planned)

Each integration verified before "Active" badge appears.

### 8.5 Billing

Subscription management.

- Current plan: Free / Pro (₹999/mo) / Business (₹2,999/mo) / Enterprise (₹7,999/mo)
- **Cashfree pill**: Live / Pending / Past due
- Upgrade button → opens UPI mandate flow
- Invoice history (all past charges)
- Receipt download per invoice

### 8.6 Notifications

Per-event notification rules.

- Trigger: any event in audit_log_v2 (e.g. "RA bill approved", "Drawing released")
- Channel: In-app / Email / WhatsApp
- Recipients: role-based (all PMs) or specific people
- Enable / disable per rule

### 8.7 Branding

White-label your firm.

- Logo upload (used in PDF letterhead)
- Accent color (hex)
- Theme: Editorial / Classic / Modern / Dark
- Letterhead PDF template
- Per-project override (for high-net-worth client work)

### 8.8 Activity

Org-wide audit log.

- Every action by every user across every project
- Filter: actor / action / resource / date range / project
- Export to CSV
- Export to PDF (formatted with letterhead — for legal disputes)

### 8.9 Feature Settings

37-feature toggle catalog.

- Group by category: nav / tabs / workflow / orgadmin
- Toggle ON/OFF per feature
- Some features plan-gated (e.g. RERA filing only on Business plan)
- Audit log records every toggle change

---

## 9. Mobile Field Worker Mode

SiteTrack on phone/tablet has the SAME app — just rendered for small screens.

### Differences vs desktop

| Desktop | Mobile |
|---|---|
| Sidebar always visible | Bottom tab bar (5 icons) |
| Hover tooltips | Long-press tooltips |
| Multi-column dashboard | Single-column scroll |
| Mouse + keyboard | Touch + 56px buttons |
| File drag-drop | Tap "+" → file picker |

### Bottom tab bar (mobile)

5 icons across the bottom (always reachable with thumb):
- **Dashboard** (home)
- **Projects** (list)
- **Activity** (feed of recent events)
- **Messages** (DMs scoped to projects)
- **Profile** (your settings, logout)

### Field-worker optimised flows

- **Quick capture** button: floating action button (FAB) — 1 tap to camera + voice note
- **Offline-first**: every entry queues locally → syncs when WiFi/4G connects
- **Big buttons** — 56px minimum (works with gloves)
- **High contrast** — readable in direct sunlight
- **Material photo upload** — auto-resize on capture to save bandwidth

---

## 10. Kiosk Modes

For sites where you want a single-purpose screen (not a full app).

### 10.1 Labour Attendance Kiosk

Single-tap attendance for site gate tablets.

- Set tablet to URL: `https://sitetrack-rakesh.vercel.app/?mode=labour-kiosk`
- Sidebar hidden, only attendance grid visible
- Worker walks in → site supervisor taps "Present" next to name → done
- Optional QR code scan for fast attendance (worker shows ID card with QR)
- PIN-locked: can't exit kiosk without 4-digit PIN

### 10.2 Site Wall Display

For the TV in your site office.

- URL: `?mode=site-wall`
- Rotates 4 dashboards every 30 sec: Progress / Safety / Weather / Today's DPR
- No interaction needed — passive display
- Great for visitor walkthroughs ("Here's what we've done this week")

### 10.3 AR Drawing Overlay (preview)

Hold phone at site → overlay current drawing on camera view → see real-world alignment.

- Currently scaffolded (not production ready)
- Watch this space

---

## 11. Integrations

### 11.1 Cashfree (UPI billing)

Pay for your subscription via UPI AutoPay.

- Setup: Org Admin → Billing → click "Subscribe" → opens Cashfree UPI mandate
- Approve in your UPI app (PhonePe / GPay / Paytm)
- Auto-charged monthly
- View invoices in Billing tab

### 11.2 WhatsApp Business

Send daily DPRs to client via WhatsApp.

- Setup: Integrations → WhatsApp → enter Phone Number ID + Permanent Token
- 4-6 week Meta verification before production use
- Per-project: enable WhatsApp for this project's client
- Daily auto-DPR: AI summary in Telugu/Hindi/English → sent at 7 PM

### 11.3 Telangana RERA (TG RERA portal)

Auto-file stage filings to rera.telangana.gov.in.

- Setup: Integrations → TG RERA → enter portal credentials + RERA number
- Per project → Compliance tab → "File stage" button
- Stage code (Foundation / Plinth / 7th floor / ...) → auto-fills from BOQ progress
- Submits + tracks ack number

### 11.4 Karnataka RERA / Maharashtra RERA

Same flow as TG RERA but routed to state-specific portals. Just shipped — KA-RERA + MH-RERA stubs ready.

### 11.5 GSTN e-invoicing

Auto-generate IRN for B2B invoices > ₹5cr turnover.

- Setup: Integrations → GSTN → GSP API key (from NIC / ClearTax / TaxPro)
- Auto on invoice raise → IRN appended + QR code embedded in invoice PDF

### 11.6 OpenAI / Anthropic (AI)

For forecasting + multi-language DPR summaries.

- Setup: Integrations → AI Provider → paste API key
- Used by: Forecast tab, Daily DPR auto-summary, AI Feature Recommender

---

## 12. Settings & Preferences

### 12.1 Per-user preferences

- Language: English / Telugu / Hindi (UI translates)
- Dark mode toggle (top-right moon icon)
- Notifications: in-app + email + WhatsApp per kind
- Display density: comfortable / compact

### 12.2 Per-project settings

- Project name / address / budget edit
- Add/remove team members
- Change project type (revisits tab visibility)
- Archive project (90-day restore window)
- Delete project (super_admin only)

### 12.3 Per-org settings (Org Admin only)

- All 9 panels in §8 above

---

## 13. Troubleshooting

### 13.1 "Magic link is invalid or has expired"

**Cause**: Gmail's link scanner prefetched and consumed the token.

**Fix**: Use the 6-digit code from the email body instead of clicking the button. Or switch to non-Gmail email.

### 13.2 "Something broke" error screen

**Cause**: Rare app crash (caught by ErrorBoundary).

**Fix**: Click "Reload" — usually fixes it. If recurring, click "Reload and clear data" (wipes browser cache; your data on server is safe).

### 13.3 Demo data not loading

**Cause**: localStorage quota exceeded (browser per-domain limit ~10 MB).

**Fix**: Clear browser localStorage (Settings → Privacy → Clear browsing data → Cookies and site data) → reload → click "Load demo data" again.

### 13.4 Sign-in works but I see "Local mode"

**Cause**: VITE_BACKEND env var not `supabase` in production build.

**Fix**: For deployers — check Vercel env vars are set + redeploy. For users — you're on a dev URL maybe; switch to production URL.

### 13.5 Photo upload fails

**Cause**: Large file (>10MB) or weak network.

**Fix**: SiteTrack auto-resizes images. If still failing, try smaller batch (5 photos at a time).

### 13.6 Can't see Org Admin gear icon

**Cause**: You're not an `org_admin` or `org_owner` role.

**Fix**: Ask your Org Owner to promote you (Org Admin → Members → edit your row → role).

### 13.7 Offline changes not syncing

**Cause**: App stuck thinking it's offline.

**Fix**: Pull-to-refresh on mobile OR reload page on desktop. Check connectivity pill in top bar (green = live, red = offline).

---

## 14. Telugu / Hindi UI

SiteTrack supports 3 languages.

### Switch language

- Profile → Settings → Language → Telugu / Hindi / English
- Or login: top-right has language picker

### Coverage

- All UI labels translated (buttons, menus, tooltips, error messages)
- AI features (DPR summary, Forecast rationale) respond in chosen language
- WhatsApp template messages: 3 templates per language

### Field workers

- Site engineers: use Telugu in Hyderabad / Vizag / Vijayawada
- Use Hindi for North India sites
- Use English for client-facing reports

### Notes

- Aadhaar / PAN / GSTIN — kept in English (statutory format)
- Numbers always in Western digits (not Telugu/Devanagari)
- Currency: ₹ symbol + Indian comma format (12,50,000)

---

## 15. Glossary

| Term | Full form | Meaning |
|---|---|---|
| **Aadhaar** | — | 12-digit ID issued by UIDAI to Indian residents |
| **AAB** | Android App Bundle | Format for Google Play uploads |
| **API** | Application Programming Interface | How software talks to other software |
| **BOQ** | Bill of Quantities | Itemised budget with quantity + rate per line |
| **CGST** | Central GST | Central govt share of GST tax |
| **CREDAI** | — | Confederation of Real Estate Developers' Associations of India |
| **CSV** | Comma-Separated Values | Spreadsheet file format |
| **DPR** | Daily Progress Report | What we did today, sent to client |
| **EPF** | Employees' Provident Fund | Statutory retirement savings |
| **ESI** | Employees' State Insurance | Statutory health insurance |
| **GSTIN** | GST Identification Number | 15-char registration ID |
| **GSTN** | GST Network | Government tax-filing portal |
| **GSP** | GST Suvidha Provider | Licensed intermediary for GSTN API access |
| **HSN** | Harmonized System of Nomenclature | Product classification code for GST |
| **IRN** | Invoice Reference Number | 64-char unique ID for e-invoice |
| **MB** | Measurement Book | PWD-spec append-only ledger of site measurements |
| **MEP** | Mechanical, Electrical, Plumbing | Building services discipline |
| **MRR** | Monthly Recurring Revenue | SaaS metric |
| **PAN** | Permanent Account Number | 10-char tax ID for individuals + entities |
| **PMC** | Project Management Consultant | Independent professional managing a project |
| **PO** | Purchase Order | Formal request to a vendor for goods |
| **PWD** | Public Works Department | Government infrastructure agency |
| **QR Code** | Quick Response Code | 2D barcode |
| **QS** | Quantity Surveyor | Professional who prices + measures construction |
| **RA Bill** | Running Account Bill | Sub-contractor invoice tied to MB |
| **RCC** | Reinforced Cement Concrete | Common construction material |
| **RERA** | Real Estate (Regulation and Development) Act | 2016 law mandating real estate filings |
| **RFI** | Request For Information | Question from contractor → architect |
| **RFP** | Request For Proposal | Bid invitation |
| **RLS** | Row Level Security | Postgres feature isolating tenant data |
| **SaaS** | Software as a Service | Cloud-hosted subscription software |
| **SGST** | State GST | State govt share of GST tax |
| **SPA** | Single Page Application | App where pages don't reload |
| **TDS** | Tax Deducted at Source | Pre-paid income tax on payments |
| **TG RERA** | Telangana RERA | State-level RERA portal |
| **UPI** | Unified Payments Interface | Indian instant-payment system |

---

## 16. FAQs

### 🟧 Pricing

**Q: Is there a free plan?**
A: Yes — 14-day free trial (1 project, 5 users, 1GB storage). After 14 days, choose Pro / Business / Enterprise or downgrade to read-only.

**Q: What's the cheapest paid plan?**
A: **Pro at ₹999/month** — 5 projects, 25 users, 20GB storage. Per-org pricing (not per-user) — disruptive vs Procore's $400/user/year.

**Q: Can I cancel anytime?**
A: Yes. UPI mandate cancel via Org Admin → Billing → Cancel. No prorated refund, but no further charges.

**Q: Do you take a cut from my vendor purchases?**
A: No. Unlike BuildSupply, we don't take procurement margin. Your vendors are yours.

### 🟦 Data & Privacy

**Q: Where is my data stored?**
A: Supabase Mumbai region (`ap-south-1`). Indian soil. Within ap-south-1 RTO + RPO < 5 min.

**Q: Can SiteTrack staff see my data?**
A: No. Row-Level Security (RLS) at the database layer prevents even our staff from reading your rows without your explicit consent (super_admin Impersonate flow — fully audited).

**Q: Can I export my data if I cancel?**
A: Yes. Org Admin → Settings → Export workspace → ZIP of all projects, BOQ, RA bills, photos, audit log → email link.

**Q: Is my data backed up?**
A: Yes. Supabase backs up Postgres hourly. We add a separate daily snapshot to S3. Storage replicates to 3 zones. Worst-case RPO ≈ 1 hour.

### 🟩 Features

**Q: Does it work offline?**
A: Yes — IndexedDB queue + sync. Field workers go offline for 2-3 days, sync when back at office WiFi. Conflict-free.

**Q: Can I use it on iPad?**
A: Yes — responsive design. Native iPad app coming Q4 (Capacitor wrap).

**Q: How is this different from Procore / Powerplay?**
A: Three big things:
1. **Pricing** — per-org (₹999), not per-user (₹31k/year). 30× cheaper for typical 20-person firm.
2. **Indian builder depth** — BOQ paste, MB-RA cycle, RERA filing, Telugu/Hindi DPR. Procore doesn't have any of these.
3. **Court-admissible audit** — Polygon-anchored audit log per IT Act 2000 s.65B. Unique vs everyone.

**Q: Do you support iOS app?**
A: Coming Q4 2026 (Capacitor wrap of the same React code). Android first (Play Store closed track now).

**Q: Telugu UI — really or just labels?**
A: Real. UI fully translated. AI features respond in Telugu (forecast rationale, DPR summary). WhatsApp templates in Telugu approved by Meta.

### 🟨 Compliance

**Q: Is the audit log court-admissible?**
A: Yes, with Polygon anchoring (Business plan+). Cryptographic proof of when each row existed = IT Act 2000 s.65B admissible. Lawyer-reviewed.

**Q: Does it handle RERA filings?**
A: Telangana RERA: yes (Business plan). Karnataka + Maharashtra: just shipped (in beta). Other states: roadmap.

**Q: Can I file GSTN e-invoices?**
A: Yes — bring your own GSP credentials. We build the IRP payload + send to your GSP (NIC / ClearTax / TaxPro). IRN appended to invoice PDF automatically.

### 🟥 Support

**Q: How do I contact support?**
A: hello@sitetrack.in or in-app: Profile → Help → Email support.

**Q: What's the response time?**
A: Pro plan: 24 hours. Business plan: 8 hours. Enterprise: 1 hour, with named CSM.

**Q: Do you offer training for my team?**
A: Yes. Business+ plan includes 2-hour Zoom onboarding for up to 10 attendees. Enterprise: in-person training in Hyderabad / Bangalore / Mumbai.

**Q: Can I request a feature?**
A: Yes — Profile → Feedback → Submit. Top votes → roadmap. We ship ~2 customer-requested features per month.

---

## 🎯 Where to go from here

- **First-time user?** Re-read §5 ("Your First Project") then click around in demo mode (§3.3).
- **Org Owner setting up?** §8 ("9 Org Admin Panels") is your bible.
- **Site engineer?** §6.3 ("Site Engineer typical day") + §9 ("Mobile Field Worker Mode").
- **Architect?** §6.1 + §7.13 (Drawings tab) + §7.6 (POs).
- **Contractor?** §6.4 + §7.9 (RA Bills) + §7.12 (Ledger).
- **Client?** §6.5 — short read. The app is read-only for you.

---

## 📞 Need help

- **In-app**: Profile → Help → Search docs or contact support
- **Email**: hello@sitetrack.in
- **WhatsApp business**: +91 78989 71337
- **GitHub issues** (technical): github.com/Rakesh-7989/Site-Tracker-Pro/issues

---

*SiteTrack Pro · Made in Hyderabad for Indian builders · 2026*  
*Last updated: Session 28.5 (June 2026) · Maintainer: Mohan Boyapati*
