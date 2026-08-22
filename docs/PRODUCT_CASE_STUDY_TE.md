# SiteTrack Pro — Product Case Study (తెలుగు)

> **Live product**: https://sitetrackpro.in (production — Vercel + Supabase)
> **ఒకే లైన్‌లో**: *SiteTrack Pro అనేది construction companyలకు కోసం built చేసిన platform — WhatsApp messages, Excel sheets, paper registers లో చెల్లాచెదురుగా ఉన్న construction operations ని ఒకే centralized, trackable digital workflow గా మారుస్తుంది.*

---

## 1. Executive Summary (సారాంశం)

SiteTrack Pro అనేది Indian construction firms, builders, architects, consultants, contractors మరియు వాళ్ల clients కోసం built చేసిన **multi-tenant, role-based construction site-management platform**. ఇది construction business యొక్క operational data అంతా — daily reports, tasks, materials, labour, finance, drawings, compliance, CRM — ని ఒకే workspace లోకి తీసుకొచ్చి **one source of truth** గా మారుస్తుంది.

సాధారణ construction firm ఈ విధంగా పని చేస్తుంది:

| ఛానల్ | దేనికి ఉపయోగిస్తారు | సమస్య |
|---|---|---|
| **WhatsApp groups** | Daily site updates, photos, issues | Chat threads లో info చెదిరిపోతుంది; structure/accountability ఉండదు |
| **Excel sheets** | Budgets, bills, labour, material stock | చాలా versions; ఎవరూ numbers ని నమ్మరు |
| **Paper registers** | Attendance, measurements, approvals | Searchable కాదు; share చేయలేరు; పోయే ప్రమాదం |
| **Phone calls** | Status అడగడానికి | Record/audit trail ఉండదు |
| **Individual memory** | "ఈ పని ఎవరిది, ఎప్పుడు?" | వ్యక్తి వెళ్లిపోతే knowledge కూడా వెళ్లిపోతుంది |

**ప్రధాన value proposition**: project managers, site engineers, business owners కి ఒకే చోట తెలిసేలా చేయడం — *ప్రతి project లో ఏం జరుగుతోంది, ఏది delay అవుతోంది, ఎవరు responsible, ఎంత ఖర్చవుతోంది, ఏది attention కావాలి* — **తెలుగు, హిందీ, ఇంగ్లీష్** లలో, ఏ phone నుంచైనా.

---

## 2. Problem (సమస్య ఏమిటి?)

### 2.1 అసలు బాధ

Construction project అంత కష్టం **construction చేయడం వల్ల కాదు — information manage చేయడం వల్ల**. ఒక project manager ప్రతి రోజూ ఇలా అడుగుతాడు:

- ఈరోజు site లో ఎంత work పూర్తయింది?
- ఏది pending? ఎందుకు delay అవుతోంది?
- ఎంత material వచ్చింది vs ఎంత వినియోగించాం?
- ఎంతమంది labour ఉన్నారు? ఎవరు absent?
- Budget లో ఎంత ఖర్చయింది? Contractor కి ఎంత ఇవ్వాలి?
- ఏ issues ఇంకా open లో ఉన్నాయి?
- Latest drawings ఎక్కడ ఉన్నాయి?
- Deadline కి on-track లో ఉన్నామా?

Traditional workflow లో దీనికి సమాధానం కావాలంటే చాలా మందిని WhatsApp, Excel, paper records లో వెదకాలి — సమాధానం వచ్చేసరికి అది stale.

### 2.2 నిర్మాణాత్మక సమస్య

Company పెద్దది అవుతుంటే ఇంకా ఘోరం. 20 villas నడిపే builder దృష్ట్యా:

```
20 sites
  × 20 engineers
  × 20 WhatsApp groups
  × చాలా Excel sheets
  × వేర్వేరు report formats
  = business ని చూడాలంటే management మొత్తం manually consolidate చేయాలి
```

Common operating picture, consistent accountability, reliable audit trail — ఏదీ లేదు.

---

## 3. దీన్ని ఎవరు ఉపయోగించాలి?

| Persona | ప్రధాన అవసరం |
|---|---|
| **Promoters / Owners / CEO** | Business-level visibility — ఏ projects delay/over budget/at risk |
| **Project Managers** | Progress, tasks, deadlines, team, cost — అన్ని projects మీద |
| **Site Engineers** | Daily progress, labour, materials, issues, photos — field నుంచి వేగంగా |
| **Contractors / Vendors** | Assigned work, POs, quote status, payment position |
| **Architects / Consultants** | Drawings, design reviews, deliverables, phases, time/billing |
| **Finance / Admin** | POs, invoices, RA bills, budget-vs-actual, ledger, revenue |
| **Clients** | Approved drawings, progress, milestones, payments — portal ద్వారా |

---

## 4. Solution Overview (పరిష్కారం ఎలా ఉంది)

SiteTrack Pro అనేది **Progressive Web App** (installable, offline-friendly, ఏ phone లోనైనా పనిచేస్తుంది), **Supabase** (Postgres + Auth + Row-Level Security + Storage) మరియు **Deno Edge Functions** తో, **Vercel** లో deploy చేయబడింది.

నాలుగు పొరలుగా:

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

ప్రతి feature మూడు independent controls తో gate అవుతుంది:

1. **Capability (RBAC)** — *ఈ action చేయడానికి ఈ వ్యక్తికి అనుమతి ఉందా?* (ఉదా. `invoice:create`, `time:log`)
2. **Plan (entitlement)** — *ఈ feature subscribed plan లో ఉందా?* (ఉదా. Finance Pro+, CRM Business+)
3. **Module / Segment** — *ఈ module org యొక్క industry కి enabled ఉందా?* (Construction / Architecture / Interior / Consultancy)

---

## 5. Features వివరంగా

### 5.1 Site Operations

- **Daily Progress Reports (DPR)** — field-to-office heartbeat. **తెలుగు/హిందీ/ఇంగ్లీష్** లలో voice-to-text, geo-tagged photos, offline queue (పేలవమైన signal ఉన్నా compose చేసి తర్వాత sync చేసుకోవచ్చు), WhatsApp share, **promoter digest**, professional PDF export.
- **Tasks & Milestones** — assignee, priority, dates, status ladder, kanban board (drag-drop + keyboard accessible).
- **Issues / Punch lists / RFI / Change orders** — owner-assigned, status-tracked (open → assigned → in progress → resolved).
- **Labour & Attendance** — kiosk clock-in/out, attendance register, **shift roster**, overtime, wages, EPF/ESI estimates.
- **Materials & Inventory** — indents, material requests, request → PO → **GRN** → inventory ledger (receipts auto-post inward stock; double entry లేదు).
- **Compliance & Safety** — inspection checklists, corrective actions (failed inspection తోనే auto-open అవుతాయి), statutory/NOC approvals.

### 5.2 Design & Consultancy

- **Drawings** — upload, versions + diff/compare tool, **CAD (DXF) preview** బ్రౌజర్ లోనే, per-drawing design-stage, approval workflow, share-link portal with **digital signature** + download control.
- **FF&E schedules, Mood boards, Rooms/Installations** — interior/design projects కోసం.
- **Phases, Time tracking, Deliverables, Review rounds** — consultancy engagement lifecycle, fee phases, billable hours.
- **Utilization & Billing** — committed fee vs billed effort, retainer + hourly invoice generation, rate cards, scheduled auto-billing.

### 5.3 Finance & Procurement

- **POs, Invoices, RA Bills, Expenses, Budget vs Actuals, Ledger** — అందరూ నమ్మే finance surface.
- **Cross-project rollups** — POs, RA bills, invoices, revenue, monthly statement (PDF), cash-flow forecast.
- **CRM / Sales pipeline** — Leads → Meetings → Quotations → Agreements → Clients; per-owner pipeline, win rates, quote-to-agreement conversion, **sales-to-project handoff** (won lead → project).
- **Procurement** — vendors, quotes, **composite supplier scoring** (price + lead time + rating), quote → PO linkage.

### 5.4 Org & Platform

- **Multi-tenant orgs** — invitations, org switcher, segment-based templates, org branding (logo + accent + page title).
- **Superadmin panel** — orgs, users/staff, billing, usage, audit log, signup/upgrade requests, support tickets, ops toggles.
- **Platform services** — global search, org calendar, notifications + digest, research library, analytics, hierarchy, approvals/delegations.
- **Kiosks** — on-site labour kiosk, site-wall display, AR drawing overlay.

### 5.5 భాష & Accessibility

- పూర్తి **i18n: తెలుగు, హిందీ, ఇంగ్లీష్** (ఒక్కో locale లో 200+ keys, parity-tested).
- 480px breakpoint, 44px touch targets, keyboard-accessible tables/tabs/boards, screen-reader labels.
- ఏ phone లోనైనా పనిచేసే PWA; field కోసం WhatsApp-first sharing.

---

## 6. Roles & Access Control

Platform లో **20+ identity roles** ఉన్నాయి — promoter, project manager, site engineer, site supervisor, site inspector, contractor, sub-contractor, architect, senior architect, designer, mep/structural consultant, client, vendor, orgadmin, superadmin, మొదలైనవి.

- **Capabilities** = fine-grained actions (`time:log`, `invoice:create`, `drawings:upload`, `procurement:view`, …).
- **Roles** = identity + project-tier + org-tier గా compose అయి runtime లో resolve అవుతాయి.
- **Plans** = entitlement; **modules/segments** = product surface.
- ప్రతి view/tab/action కి **defense-in-depth**: UI gating + server-side RLS/RPC enforcement.

ఫలితం: site engineer తనకు assign అయిన projects మరియు logging tools మాత్రమే చూస్తాడు; promoter అన్నీ చూస్తాడు; client తన portal మాత్రమే; మరొక tenant data ఎవరికీ కనిపించదు.

---

## 7. End-to-End Workflows

### Workflow A — Daily site reporting (field loop)
```
Site engineer phone లో app తెరుస్తాడు
  → "New DPR" నొక్కుతాడు
  → తెలుగులో dictate చేస్తాడు (voice-to-text)
  → geo-tagged photo attach చేస్తాడు
  → submit చేస్తాడు (offline అయినా queue అవుతుంది)
  → promoter కి WhatsApp digest వెళ్తుంది
  → PM dashboard లో progress చూస్తాడు
  → DPR ని client కోసం PDF export చేస్తాడు
```

### Workflow B — Material procurement → settlement
```
Engineer material request పెడతాడు (item, qty, need date)
  → manager approve చేస్తాడు
  → request → Purchase Order గా మారుతుంది
  → vendor quotes submit చేస్తారు → composite scoring best value ని ఎంచుతుంది
  → PO → goods received (GRN) → inventory ledger auto-post
  → receipt PO ని settle చేస్తుంది → delivery progress bar update
```

### Workflow C — Finance close
```
Time → phases + rate cards కి log అవుతుంది
  → manager approve చేస్తాడు
  → monthly retainer/hourly invoice generate అవుతుంది (line items తో)
  → invoice org register లో payment status తో కనిపిస్తుంది
  → revenue, utilization, monthly statement, cash-flow rollups auto-update
```

---

## 8. Business Value (వ్యాపార విలువ)

| Outcome | SiteTrack ఎలా ఇస్తుంది |
|---|---|
| **Time ఆదా** | Reporting, consolidation, invoice generation automate |
| **Visibility** | ఒక dashboard నుంచి అన్ని projects యొక్క real-time status |
| **Accountability** | ప్రతి task/issue/approval కి owner + status |
| **Cost control** | Budget vs actuals, POs, receipts, payments — ఒకే ledger |
| **తక్కువ delays** | Overdue tasks, low stock, open issues — early signal |
| **Better documentation** | Centralized drawings, contracts, approvals, audit trail |
| **Scalability** | 10–50 sites ఒకే account, ఒకే data model |
| **Trust** | Immutable audit trail; role-scoped access |

---

## 9. Pricing (ధరలు)

మూడు self-serve tiers (ధరలు 18% GST కి ముందు; annual = 2 నెలలు free ≈ 17% తగ్గింపు), **14-day free trial** — credit card అవసరం లేదు:

| Tier | ₹/నెల | ఎవరి కోసం | Key limits |
|---|---|---|---|
| **Basic** | ₹5,999 | Small contractors | 5 members · 5 projects · DPR, materials, attendance, WhatsApp share |
| **Pro** | ₹11,999 | Growing multi-site firms | 20 members · unlimited projects · finance, drawings, approvals, RERA/GST, audit log |
| **Business** | ₹19,999 | Established builders | 100 members · custom roles · automated WhatsApp DPR + payments, GSTN filing |

Upgrade billing page నుంచే self-serve (Cashfree UPI/CC); quota engine over-usage ని block చేసి UI లో limits చూపిస్తుంది.

---

## 10. Technology Architecture

### Frontend (React 19 SPA)
- **React 19 + Vite 8 + TypeScript 5.9 + Tailwind CSS** — design-system token layer (theme-aware CSS variables, semantic utilities).
- **Lazy route loading** via plugin catalog; installable **PWA**.
- Dependency-free **SVG chart library** + virtualized/sortable/resizable/sticky DataTable (keyboard accessible).
- Client-side **PDF** (jsPDF) — DPRs, monthly statements.

### Backend (Supabase BaaS)
- **Postgres** — 155+ tables, **200+ versioned migrations**.
- **Row-Level Security** ప్రతి table పైనా; `user_org_ids`, `can_read_project`, `can_write_project` — tenant boundary.
- **Auth** (email/password, magic links, canonical-domain redirects); org-scoped storage policies.
- **25 Deno Edge Functions** — register/invite, DPR send, notification delivery, RERA/GSTN/e-invoice, webhooks, cron.

### Integrations
- **WhatsApp Cloud API** (templates, DPR delivery, digest)
- **Resend** (verified-domain email) · **Cashfree** (UPI/CC subscriptions) · **Gmail SMTP** (confirm/magic-link)

### Delivery & Quality
- **Vercel** hosting + **GitHub Actions** CI (lint → typecheck → build → smoke → unit tests → coverage → mocked e2e)
- DB **column-drift gate** ప్రతి push కి live DB మీద రన్ అవుతుంది

### Engineering scale (real numbers)
| Measure | Value |
|---|---|
| DB migrations | 200+ |
| Live tables | 155+ |
| Edge Functions | 25 |
| Unit tests | 2,856 (224 files) |
| Cross-tenant RLS assertions | 506 |
| Smoke checks | 400+ |
| Roles | 20+ identity roles |

---

## 11. Security (భద్రత)

- **Multi-tenant isolation by design** — RLS ప్రతి table మీద; org/project-scoped storage; **cross-tenant attack tests** (506 live-DB assertions, org A/B/user C matrix) CI లో నడుస్తాయి.
- **Server-side enforcement** — project lifecycle/archive rules UI ని mirror చేసి API లోనూ అమలు అవుతాయి.
- **Capability-gated Edge Functions** — JWT verification + role/project/org checks.
- **Tamper-evident audit trail** + export.
- Secrets ఎప్పుడూ commit కావు.

---

## 12. Competitors & USP

| Alternative | Gap vs SiteTrack Pro |
|---|---|
| **Excel / Sheets** | Data storage మాత్రమే — operating system కాదు; roles/workflow/accountability లేవు |
| **WhatsApp** | Chat కి బాగుంది; structure/tracking/reporting కి పనికిరాదు |
| **Generic PM tools** (Trello/Asana/Notion) | Construction-native కాదు; RERA/GST/RA bills/DPR/drawings/kiosks లేవు |
| **ERP suites** | ఖరీదైనవి, complex, desktop-era; field teams use చేయలేరు |
| **Simple "site tracker" apps** | ఒకే feature; whole-company operations platform కాదు |

**USP**: construction-native workflows (DPR, RA bills, RERA, GRN), **field కోసం built** (తెలుగు/హిందీ voice, WhatsApp, offline, ఏ phone), operations + finance + CRM + compliance ఒకే data model లో — security/scale day-one నుంచి.

---

## 13. Roadmap — Construction Intelligence దిశగా

Platform యొక్క data AI కి perfect — *structured* operational history ఉంది (tasks, delays, material flows, labour, costs, issues). Roadmap:

- **Predictive delay** — "ఈ project బహుశా 6 రోజులు delay అవుతుంది" (overdue tasks, low labour, material lag నుంచి).
- **Cost prediction** — "ఈ burn rate తో ₹2.4L overrun అవుతుంది."
- **Material forecasting** — "Cement stock 4 రోజుల్లో అయిపోతుంది."
- **Labour productivity analytics** — "Brickwork productivity ఈ వారం 18% తగ్గింది."
- **AI project assistant** — "ఏ projects at risk?" → "3: Villa 04, Villa 11, Villa 16."

ఇదే natural evolution: **Site Tracker → Project Management → Construction Operations → Construction Intelligence**.

---

## 14. 5-నిమిషాల Demo Script

1. **Landing (30s)** — "Run every site from one place." Sign up → 14-day free trial, card లేదు.
2. **Org setup (30s)** — industry segment ఎంచుకోండి (Construction) → company పేరు; templates modules ని pre-select చేస్తాయి.
3. **Project create (45s)** — name, type, budget; team member ని email/WhatsApp ద్వారా role తో invite (ఉదా. Site Engineer).
4. **Field loop (90s)** — Site Engineer గా: DPR తెరవండి → తెలుగులో dictate → geo-tagged photo → submit → offline queue + WhatsApp digest → DPR PDF.
5. **Finance (90s)** — PM గా: material request → approve → PO → vendor quote → receipt/GRN → inventory. తర్వాత retainer invoice → Revenue + Monthly Statement.
6. **Management view (45s)** — promoter గా: org dashboard — project progress, open issues, budget-vs-actual, labour today; role-scoped views RBAC ని నిరూపిస్తాయి.
7. **Close (30s)** — "One platform: operations + finance + CRM + compliance — Indian construction కోసం, తెలుగు/హిందీ/ఇంగ్లీష్ లో, ఏ phone లోనైనా."

---

## 15. ఎందుకు దీన్ని built చేశాను

> "Construction లో ఒక సాధారణ operational failure ని చూశాను: critical information WhatsApp threads, Excel sheets, paper registers, మనుషుల heads లో చెల్లాచెదురుగా ఉంటుంది — అందువల్ల ఎవరూ numbers ని నమ్మరు, promoter కి ఎప్పుడూ చివర్లో తెలుస్తుంది. ఆ workflows ని ఒకే construction-native platform లోకి centralize చేయడానికి SiteTrack Pro ని built చేశాను — field మాట్లాడే భాషలో, field కోసం."

---

*ఈ case study లోని ప్రతి feature, role, number — live product మరియు codebase నుంచి తీసుకోబడ్డాయి; https://sitetrackpro.in లో అన్నీ actually shipped + running.*