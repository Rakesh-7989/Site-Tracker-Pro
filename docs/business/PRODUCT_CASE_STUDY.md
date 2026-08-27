# SiteTrack Pro — Product Case Study

> **Live product**: https://sitetrackpro.in (production, on Vercel + Supabase)
> **One-liner**: *SiteTrack Pro is a construction operations platform that turns scattered WhatsApp messages, spreadsheets, and paper registers into one centralized, trackable digital workflow for Indian construction firms.*

---

## 1. Executive Summary

SiteTrack Pro is a multi-tenant, role-based construction site-management platform built for Indian construction companies, builders, architects, consultants, contractors, and their clients. It centralizes the operational data of a construction business — daily reports, tasks, materials, labour, finance, drawings, compliance, and CRM — into a single workspace with one source of truth.

The product was built because a typical construction firm operates from a stack of disconnected tools:

| Channel | What it's used for | Problem |
|---|---|---|
| WhatsApp groups | Daily site updates, photos, issues | Information lost in chat threads; no structure, no accountability |
| Excel sheets | Budgets, bills, labour, material stock | Multiple versions; nobody trusts the numbers |
| Paper registers | Attendance, measurements, approvals | Not searchable; not shared; risk of loss |
| Phone calls | Status queries | No record; no audit trail |
| Individual memory | "Who owns what, when it's due" | Knowledge walks out the door with the person |

**The core value proposition**: give project managers, site engineers, and business owners *one place to know what is happening on every project, what is delayed, who is responsible, what it costs, and what needs attention* — in Telugu, Hindi, or English, from any phone.

---

## 2. Problem Statement

### 2.1 The user's real pain

A construction project is not hard because of the construction — it is hard because of **information management**. A project manager asks daily:

- How much work was completed on site today?
- What is pending, and why is it delayed?
- How much material was received vs consumed?
- How many labourers were present, and who was absent?
- What has been spent against budget, and what is still owed to contractors?
- Which issues are still open?
- Where are the latest drawings?
- Are we on track to hit the deadline?

In a traditional workflow, answering these questions requires chasing multiple people across WhatsApp, Excel files, and physical records — and by the time the answer arrives it is already stale.

### 2.2 The structural problem

The larger the company, the worse it gets. A builder running 20 villa sites has:

```
20 sites
  × 20 engineers
  × 20 WhatsApp groups
  × multiple Excel sheets
  × different report formats
  = management manually consolidates everything to see the business
```

There is no common operating picture, no consistent accountability, and no reliable audit trail.

---

## 3. Who It Is For

| Persona | Primary need |
|---|---|
| **Promoters / Owners / CEO** | Business-level visibility: which projects are delayed, over budget, or at risk |
| **Project Managers** | Track progress, tasks, deadlines, team performance, and costs across projects |
| **Site Engineers** | Log daily progress, labour, materials, issues, and photos from the field — fast |
| **Contractors / Vendors** | See assigned work, POs, quote status, and payment position |
| **Architects / Consultants** | Manage drawings, design reviews, deliverables, phases, and time/billing |
| **Finance / Admin** | POs, invoices, RA bills, budget-vs-actual, ledger, revenue |
| **Clients** | A portal to see approved drawings, progress, milestones, and payments |

---

## 4. Solution Overview

SiteTrack Pro is a **Progressive Web App** (installable, offline-tolerant, works on any phone) backed by **Supabase** (Postgres + Auth + Row-Level Security + Storage) and **Deno Edge Functions**, deployed on **Vercel**.

It is organized into four layers:

```
                    SITE TRACK PRO
                          │
            ┌─────────────┴─────────────┐
            │                           │
       OPERATIONS                   MANAGEMENT
            │                           │
   Tasks·Labour·Materials·DPR      KPIs·Reports·CRM·Finance
   Drawings·Compliance·Inventory   Analytics·Forecast·Usage
            │                           │
            └─────────────┬─────────────┘
                          │
                     PROJECT DATA
                          │
                      ROW-LEVEL SECURITY (multi-tenant)
                          │
                  AI / ANALYTICS (roadmap)
                          │
                    DECISION SUPPORT
```

Every feature is gated by three orthogonal controls, giving fine-grained control without hard-coded permissions:

1. **Capability** (RBAC) — *can this person perform this action?* (e.g. `invoice:create`, `time:log`)
2. **Plan** (entitlement) — *is this feature included in the subscribed plan?* (e.g. Finance on Pro+, CRM on Business+)
3. **Module / Segment** — *is this module enabled for the org's industry?* (Construction / Architecture / Interior / Consultancy)

---

## 5. Feature Deep-Dive

### 5.1 Site Operations

- **Daily Progress Reports (DPR)** — the field-to-office heartbeat. Voice-to-text dictation in **Telugu, Hindi, and English**, geo-tagged photos, offline queue (compose on site with poor signal, sync later), WhatsApp share, and a **promoter digest**. Exportable as a professional PDF.
- **Tasks & Milestones** — assignee, priority, start/due dates, status ladder, kanban board with drag-and-drop and keyboard accessibility.
- **Issues / Punch lists / RFI / Change orders** — structured, owner-assigned, status-tracked (open → assigned → in progress → resolved).
- **Labour & Attendance** — kiosk clock-in/out, attendance register, **shift roster**, overtime, wages, and EPF/ESI statutory estimates.
- **Materials & Inventory** — indents, material requests, and a request → PO → **GRN** → inventory ledger chain (goods receipts auto-post inward stock; no double entry).
- **Compliance & Safety** — inspection checklists, corrective actions that auto-open on failed inspections, statutory/NOC approvals, site inspections.

### 5.2 Design & Consultancy

- **Drawings** — upload, versioning with a diff/compare tool, **CAD (DXF) preview** in-browser, per-drawing design-stage, approval workflow, and a share-link portal with **digital signature** and download control.
- **FF&E schedules, Mood boards, Rooms/Installations** — for interior and design projects.
- **Phases, Time tracking, Deliverables, Review rounds** — the consultancy engagement lifecycle with fee phases and billable hours.
- **Utilization & Billing** — committed fee vs billed effort per phase, retainer + hourly invoice generation, rate cards, auto-billing via scheduled job.

### 5.3 Finance & Procurement

- **Purchase Orders, Invoices, RA Bills, Expenses, Budget vs Actuals, Ledger** — a finance surface every stakeholder can trust.
- **Cross-project rollups** — POs, RA bills, invoices, revenue, monthly statement (PDF export), cash-flow forecast.
- **CRM / Sales pipeline** — Leads → Meetings → Quotations → Agreements → Clients, with per-owner pipeline, win rates, quote-to-agreement auto-conversion, and **sales-to-project handoff** (a won lead becomes a project).
- **Procurement** — vendors, quote requests, **composite supplier scoring** (price + lead time + rating), and quote → PO linkage.

### 5.4 Org & Platform

- **Multi-tenant orgs** — invitation-based membership, org switcher, segment-based industry templates, org-level branding (logo + accent theme + branded page title).
- **Superadmin panel** — platform orgs, users/staff, billing, usage, audit log, signup/upgrade requests, support tickets, ops toggles.
- **Platform services** — global search, org calendar, notifications + digests, research library, analytics, hierarchy, approvals/delegations.
- **Kiosks** — on-site labour kiosk, site-wall display, and an AR drawing overlay for site walks.

### 5.5 Language & Accessibility

- Full **i18n in Telugu, Hindi, and English** (200+ keys per locale, parity-tested).
- 480px breakpoint, 44px touch targets, keyboard-accessible tables/tabs/boards, screen-reader labels.
- Works on any phone; installable PWA; WhatsApp-first sharing for the field.

---

## 6. Roles & Access Control

The platform ships **20+ identity roles** (promoter, project manager, site engineer, site supervisor, site inspector, contractor, sub-contractor, architect, senior architect, designer, mep/structural consultant, client, vendor, orgadmin, superadmin, and more), each mapped to a capability matrix.

- **Capabilities** are fine-grained actions (`time:log`, `invoice:create`, `drawings:upload`, `procurement:view`, …).
- **Roles** are composed into identity + project-tier + org-tier layers, resolved at runtime.
- **Plans** gate entitlement; **modules/segments** gate product surface.
- Every view, tab, and action is defense-in-depth checked — UI gating *and* server-side RLS/RPC enforcement.

This means: a site engineer sees only their assigned projects and their logging tools; a promoter sees everything in the org; a client sees only their portal; nobody sees another tenant's data.

---

## 7. End-to-End Workflows

### Workflow A — Daily site reporting (the field loop)
```
Site engineer opens app on phone
  → taps "New DPR"
  → dictates update in Telugu (voice-to-text)
  → attaches a geo-tagged photo
  → submits (works offline; queued)
  → promoter receives the digest on WhatsApp
  → PM sees progress on the dashboard
  → DPR exported to PDF for the client
```

### Workflow B — Material procurement to settlement
```
Engineer raises a material request (item, qty, need date)
  → manager approves
  → request converts into a Purchase Order
  → vendor submits quotes (portal) → composite scoring picks best value
  → PO raised → goods received (GRN) → inventory ledger auto-posted
  → receipt settles against the PO → delivery progress bar updates
```

### Workflow C — Finance close
```
Time logged against phases + rate cards
  → approved by the manager
  → monthly retainer/hourly invoice generated (with line items)
  → invoice appears in the org register with payment status
  → revenue, utilization, monthly statement, and cash-flow rollups update automatically
```

---

## 8. Business Value & Outcomes

| Outcome | How SiteTrack delivers it |
|---|---|
| **Save time** | Field reporting, consolidation, and invoice generation are automated |
| **Visibility** | Real-time status across every project from one dashboard |
| **Accountability** | Every task/issue/approval has an owner and a status |
| **Cost control** | Budget vs actuals, POs, receipts, and payment position in one ledger |
| **Fewer delays** | Early signal on overdue tasks, low stock, and open issues |
| **Better documentation** | Centralized drawings, contracts, approvals, and audit trail |
| **Scalability** | 10–50 sites managed from one account, one data model |
| **Trust** | Immutable, tamper-evident audit trail; role-scoped access |

---

## 9. Pricing & Monetization

Three self-serve tiers (prices exclude 18% GST; annual = 2 months free ≈ 17% discount), plus a **14-day free trial** with no credit card:

| Tier | ₹/mo | Ideal for | Key limits |
|---|---|---|---|
| **Basic** | ₹5,999 | Small contractors | 5 members · 5 projects · DPR, materials, attendance, WhatsApp share |
| **Pro** | ₹11,999 | Growing multi-site firms | 20 members · unlimited projects · finance, drawings, approvals, RERA/GST, audit log |
| **Business** | ₹19,999 | Established builders | 100 members · custom roles · automated WhatsApp DPR + payments, GSTN filing, priority support |

Upgrade is self-serve from the billing page (Cashfree UPI/CC); a superadmin upgrade-request queue handles plan changes. An org-level quota engine prevents over-usage and surfaces limits in the UI.

---

## 10. Technology Architecture

### Frontend (React 19 SPA)
- **React 19 + Vite 8 + TypeScript 5.9 + Tailwind CSS** with a design-system token layer (theme-aware CSS variables, semantic utilities).
- **Lazy route loading** via a plugin catalog (module-gated chunks); installable **PWA** with offline shell.
- Dependency-free **SVG chart library** (bar/grouped-bar/pie/line) and virtualized, sortable, resizable, sticky-column, keyboard-accessible **DataTable**.
- Client-side PDF generation (jsPDF) for DPRs and monthly statements.

### Backend (Supabase BaaS)
- **Postgres** schema (155+ tables) evolved through **200+ versioned migrations**.
- **Row-Level Security** on every table; org/project membership functions (`user_org_ids`, `can_read_project`, `can_write_project`) as the tenant boundary.
- **Auth** (email + password, magic links, confirm/redirect flows on the canonical domain), storage buckets with org-scoped policies.
- **25 Deno Edge Functions** (`_shared` helpers for auth, CORS, plan checks, WhatsApp, Cashfree): register/invite flows, DPR send, notification delivery, RERA/GSTN/e-invoice, webhooks, cron jobs.

### Integrations
- **WhatsApp Cloud API** (text + templates, DPR delivery, digest).
- **Resend** (transactional email on a verified domain).
- **Cashfree** (UPI/CC subscriptions + payment links).
- **Gmail SMTP** (confirmation/magic-link emails).

### Infrastructure & Delivery
- **Vercel** hosting + CI; **GitHub Actions** (lint → typecheck → build → smoke → 2,800+ unit tests → coverage → mocked role-access e2e).
- **Database column-drift CI gate** runs against the live DB on every push.

### Engineering scale (real numbers)
| Measure | Value |
|---|---|
| DB migrations | 200+ |
| Live tables | 155+ |
| Edge Functions | 25 |
| Unit tests | 2,856 across 224 files |
| Cross-tenant RLS assertions | 506 |
| Smoke checks | 400+ |
| Roles | 20+ identity roles, fine-grained capability matrix |

---

## 11. Security

- **Multi-tenant isolation by design**: RLS on every table, org/project-scoped storage policies, and a **cross-tenant attack-test suite** (506 live-DB assertions, org A / org B / user C matrix) that runs in CI.
- **Server-side enforcement** of lifecycle rules (project status transitions, archiving) that mirror the UI — no direct-API holes.
- **Capability-gated Edge Functions** with JWT verification + role/project/org checks.
- **Tamper-evident audit trail** and org-wide audit log with export.
- Secrets are never committed; tokens live in CI/Vercel/EF secrets (gitignored local env).

---

## 12. Competitive Landscape & USP

| Alternative | Gap vs SiteTrack Pro |
|---|---|
| **Excel / Google Sheets** | Data storage, not an operating system — no people, roles, workflow, or accountability |
| **WhatsApp** | Excellent for chat; terrible for structure, tracking, and reporting |
| **Generic PM tools** (Trello/Asana/Notion) | Not construction-native; no RERA, GST, RA bills, DPR, drawings, kiosks |
| **ERP suites** (heavyweight) | Costly, complex, desktop-era; field teams can't actually use them |
| **Simple "site tracker" apps** | A single feature (progress updates); not a whole-company operations platform |

**USP**: construction-native workflows (DPR, RA bills, RERA, GRN), **built for the field** (Telugu/Hindi voice input, WhatsApp, offline, any phone), and a **single data model spanning operations + finance + CRM + compliance** — with security and scale designed in from day one.

---

## 13. Roadmap — Toward Construction Intelligence

The platform's data is uniquely positioned for AI because it captures *structured* operational history (tasks, delays, material flows, labour, costs, issues). Roadmap modules:

- **Predictive delay** — "This project is likely to finish 6 days late" (from overdue tasks, low labour, material lag).
- **Cost prediction** — "At this burn rate, budget overrun is ₹2.4L" (from budget vs actuals + trend).
- **Material forecasting** — "Cement stock will run out in 4 days."
- **Labour productivity analytics** — "Brickwork productivity dropped 18% this week."
- **AI project assistant** — "Which projects are at risk?" → "3 projects: Villa 04, Villa 11, Villa 16."

This is the natural evolution the product is architected for: **Site Tracker → Project Management → Construction Operations → Construction Intelligence**.

---

## 14. A 5-Minute Demo Script

1. **Landing (30s)** — "Run every site from one place." Sign up → 14-day free trial, no card.
2. **Set up an org (30s)** — pick industry segment (Construction), name the company; templates pre-select modules.
3. **Create a project (45s)** — name, type, budget; add a team member by email/WhatsApp with a role (e.g. Site Engineer).
4. **Field loop (90s)** — as Site Engineer: open DPR → dictate in Telugu → attach a geo-tagged photo → submit → show the offline-queue + WhatsApp digest → open the DPR PDF.
5. **Finance (90s)** — as PM: material request → approve → PO → vendor quote → receipt/GRN → inventory. Then a retainer invoice → appears in Revenue + Monthly Statement.
6. **Management view (45s)** — switch to promoter: org dashboard shows project progress, open issues, budget vs actual, labour today; role-scoped views prove RBAC.
7. **Close (30s)** — "One platform: operations + finance + CRM + compliance, built for Indian construction, in Telugu/Hindi/English, on any phone."

---

## 15. Why I Built It

> "I saw a common operational failure in construction: critical information scattered across WhatsApp threads, Excel sheets, paper registers, and people's heads — so nobody trusted the numbers and the promoter was always the last to know. I built SiteTrack Pro to centralize those workflows into one construction-native platform: better visibility, accountability, and control for builders, contractors, and their teams — built for the field, in the language the field speaks."

---

*Prepared from the live product and codebase — every feature, role, and number in this case study reflects what is actually shipped and running at https://sitetrackpro.in.*