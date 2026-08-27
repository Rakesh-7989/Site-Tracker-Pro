# Site-Tracker-Pro — Master Architecture Reference

> "If a new engineer reads only one doc, this is it."
>
> Covers all five architectural dimensions explicitly: **System / Application / Product / Mobile / Build-Up**.  
> All diagrams are ASCII so they render in any terminal, PR review, or PDF print.  
> All code references use real file paths committed to `main` as of Session 26.

---

## 0. Executive Overview

Site-Tracker-Pro is a **multi-tenant SaaS for Indian builders** that runs as:

1. **A web SPA** at `sitetrackpro.in` (cream/editorial UI, English/Telugu/Hindi).
2. **A static marketing site** at `sitetrackpro.in` (one-pager + pricing + sign-up).
3. **An Android app** wrapping the SPA via Capacitor (kiosks + offline-first capture).
4. **Edge functions** running on Supabase Deno for webhook-signature-required work
   (Cashfree subscription, RERA submit).
5. **A managed Postgres** behind Supabase with Row Level Security, anchored by an
   immutable `audit_log_v2` table whose digests can optionally be checkpointed
   to Polygon mainnet.

The **four architectural layers** are independent in build but composed at runtime:

```
                   ┌─────────────────────────────────────────────┐
                   │       PRODUCT  (what a user can do)         │
                   │   4 project types × ~15 roles × 37 features │
                   └────────────────────┬────────────────────────┘
                                        │ gates ▼
                   ┌─────────────────────────────────────────────┐
                   │     APPLICATION  (how the SPA is coded)     │
                   │  React + Vite + 5 lazy chunks + 24 libs     │
                   └────────────────────┬────────────────────────┘
                                        │ runs on ▼
            ┌────────────────────────────────────────────────────────┐
            │   SYSTEM  (where it runs)                              │
            │   Vercel · Supabase · Polygon · Cashfree · Meta · TG   │
            └────────────────────┬───────────────────────────────────┘
                                 │ wrapped by ▼
            ┌────────────────────────────────────────────────────────┐
            │   MOBILE  (how it ships to phones)                     │
            │   Capacitor → Android .aab → Play Store closed track   │
            └────────────────────────────────────────────────────────┘
```

The five sections that follow describe each layer **and** how it composes with the others.

---

## 1. System Architecture

> *"Where does each byte live, and what crosses which boundary?"*

### 1.1 Topology — production target

```
                           ┌──────────────────────────────┐
                           │   USER (browser or Android)  │
                           └──────┬───────────────┬───────┘
                                  │ HTTPS         │ HTTPS
              (static one-pager)  ▼               ▼  (signed-in SPA)
                       ┌────────────────────┐  ┌────────────────────────┐
                       │ sitetrackpro.in       │  │ sitetrackpro.in       │
                       │ Vercel · static    │  │ Vercel · SPA           │
                       │ /landing.html      │  │ Vite dist/             │
                       └────────────────────┘  └─────────┬──────────────┘
                                                         │ HTTPS
                                            ┌────────────┴────────────┐
                                            ▼                         ▼
                       ┌────────────────────────────┐    ┌────────────────────────┐
                       │ Supabase managed (ap-south)│    │ External integrations  │
                       │  · Postgres + RLS          │    │                        │
                       │  · Auth (magic link)       │    │  · Cashfree (UPI       │
                       │  · Realtime (WS)           │    │      AutoPay)          │
                       │  · Storage (S3-compat)     │    │  · Meta WhatsApp       │
                       │  · Edge Functions (Deno)   │    │     Business Cloud API │
                       │     → cashfree-subscription│    │  · Polygon RPC         │
                       │     → cashfree-webhook     │    │     (anchoring)        │
                       │     → tg-rera-submit       │    │  · OpenAI / Anthropic  │
                       └────────┬───────────────────┘    │     (forecasts / DPR)  │
                                │                        │  · TG RERA portal      │
                                ▼                        └────────────────────────┘
                       ┌────────────────────────────┐
                       │ audit_log_v2  (append-only)│
                       │   SECURITY DEFINER RPC     │
                       │   ↓ hourly digest          │
                       │ Polygon mainnet · anchor() │
                       └────────────────────────────┘
```

### 1.2 Boundaries & trust model

| Boundary | Crosses | Trust | Enforced by |
|---|---|---|---|
| Browser → Vercel static | Public HTML | Untrusted | CSP headers (planned), Vercel WAF |
| Browser → Supabase REST | Anon JWT or user JWT | Per-user | RLS using `current_setting('app.tenant_id')` + JWT claims |
| Browser → Edge Function | Anon JWT | Per-user | EF reads JWT, calls `supabaseAdmin` with allow-listed ops only |
| Edge Function → Postgres | `service_role` JWT | Server-only | EF env-var; never sent to browser |
| Webhook (Cashfree) → EF | Cashfree HMAC sig | Cryptographic | `verifyWebhookSignature()` in [src/lib/cashfree.js](src/lib/cashfree.js) |
| EF → Polygon | RPC URL + signer key | Server-only | Signer adapter pattern in [src/lib/blockchainAnchor.js](src/lib/blockchainAnchor.js) |
| EF → Meta WhatsApp | Page-token (Permanent) | Server-only | Stored in EF env, never in repo |

**Two zones of trust:**

- **Zone A — Browser:** holds anon key + user JWT. May call any RLS-protected endpoint. Cannot read other tenants' data because `app.tenant_id` is set from JWT.
- **Zone B — Edge Functions / Server:** holds `service_role`, Cashfree secret, Polygon key, WhatsApp token, OpenAI key. Browser never sees these.

### 1.3 Data flow — magic-link login (full path)

```
1. User types email on sitetrackpro.in
2. SPA calls supabase.auth.signInWithOtp({email})  ──► Supabase Auth
3. Supabase emails magic link  ──► User's inbox
4. User clicks link  ──► returns to sitetrackpro.in?code=...
5. SPA exchanges code for JWT (auto, Supabase SDK)
6. JWT contains: sub, email, app_metadata.tenant_id, app_metadata.role
7. SPA stores JWT in localStorage (Supabase SDK default)
8. Next REST/Realtime call attaches JWT; Postgres parses + sets app.tenant_id
9. RLS policies evaluate using app.tenant_id  ──► Rows filtered before send
```

See [src/lib/supabase.js](src/lib/supabase.js) for client-side helpers and
[docs/setup/CONNECT_SUPABASE.md](docs/setup/CONNECT_SUPABASE.md) for the 8-step server-side bootstrap.

### 1.4 Data flow — Cashfree subscription activation

```
SPA           cashfree-subscription EF      Cashfree API         User
 │  start sub          │                       │                   │
 │ ──────────────────► │                       │                   │
 │                     │  POST /subscriptions  │                   │
 │                     │ ────────────────────► │                   │
 │                     │ ◄─────── 201 {url}    │                   │
 │  {pay_url}          │                       │                   │
 │ ◄─────────────────  │                       │                   │
 │  redirect ────────────────────────────────► │  UPI mandate page │
 │                                              │ ────────────────► │
 │                                              │ ◄──── approve ─── │
 │                                              │                   │
 │                                              │  POST webhook     │
 │                     cashfree-webhook EF ◄─── │                   │
 │                     │ verifyHmac() ✓         │                   │
 │                     │ applyWebhookEvent()    │                   │
 │                     │ INSERT subscriptions   │                   │
 │                     │ UPDATE orgs.plan       │                   │
 │ realtime ◄──────────│ (broadcast)            │                   │
 │ "plan = pro" badge  │                        │                   │
```

Both EFs share [supabase/functions/_shared/cashfree.ts](supabase/functions/_shared/cashfree.ts).

### 1.5 Data flow — Polygon audit anchoring (optional, daily cron)

```
00:00 IST cron  ──► EF anchor-digest
                      │
                      │ SELECT * FROM audit_log_v2 WHERE day = yesterday
                      │   ORDER BY id
                      ▼
                    [row, row, row, ...]
                      │
                      ▼  hashAuditRow(row) per row
                    [h1, h2, h3, ...]
                      │
                      ▼  merkleRoot()
                       root (32 bytes)
                      │
                      ▼  polygonAdapter.anchor(root, {selector: 0xeecdf927})
                    Polygon contract anchor(bytes32) → emits event
                      │
                      ▼  INSERT audit_anchors {day, root, tx, block}
```

Pure-function core is testable without RPC; see [src/lib/blockchainAnchor.js](src/lib/blockchainAnchor.js) and 33 tests in [src/lib/blockchainAnchor.test.js](src/lib/blockchainAnchor.test.js).

### 1.6 Environments

| Env | URL | Backend | Plays Store track | Purpose |
|---|---|---|---|---|
| **local-demo** | localhost:5173 | localStorage (no Supabase) | — | Dev + offline demos |
| **local-live** | localhost:5173 | dev Supabase project | — | Pre-production validation |
| **staging** | staging.sitetrackpro.in | staging Supabase project | Internal | QA + investor demos |
| **production** | sitetrackpro.in | prod Supabase project (`ap-south-1`) | Closed/Open | Real customers |

The same Vite build runs everywhere; the only difference is the `VITE_BACKEND` /
`VITE_SUPABASE_*` env vars (and the Capacitor wrapper for mobile).

### 1.7 Observability stack (planned)

| Concern | Service | Status |
|---|---|---|
| Browser errors | Sentry | ✅ Shipped Session 27.4 — lib + ErrorBoundary wiring + 15 tests. No-op when `VITE_SENTRY_DSN` unset. |
| Edge Function errors | Supabase log drains | Live (Supabase default) |
| Postgres slow queries | `pg_stat_statements` + Supabase dashboard | Live |
| Customer-facing status | Statuspage.io free tier | Planned (Phase 4) |
| Synthetic uptime | Better Stack ping every 60s | Planned (Phase 1, Day 8) |
| Cashfree webhook drops | Custom EF `/webhook-health` | Planned (Phase 2) |

---

## 2. Application Architecture

> *"How is the React app organised — what's where and why?"*

### 2.1 Source tree (excluding deps + build outputs)

```
src/
├── main.jsx                      ← React root + top-level ErrorBoundary
├── App.jsx                       ← Orchestrator (state, routing, gates) ~2,300 lines
├── index.css                     ← Tailwind directives + editorial overrides
├── data/
│   ├── seed.js                   ← MOCK_USERS + 39 INIT_* fixtures (~1,400 lines)
│   ├── seed.demo.js              ← Mohan Boyapati org-admin tenant fixture
│   └── lookups.js                ← UI-only labels (TAB_LABELS, BOQ_UNITS, etc.)
├── components/
│   ├── ui.jsx                    ← Ic / Av / Badge / PBar / SC / ROLE_META / fmt
│   ├── attachments.jsx           ← AttachmentInput/Row/List + read/icon helpers
│   └── errorBoundary.jsx         ← Top-level + per-chunk safety net
├── features/
│   ├── shell/index.jsx           ← LoginScreen, Sidebar, Dashboard, Projects, Create
│   ├── admin/index.jsx           ← 8 SuperAdmin panels  (chunk: 'admin')
│   ├── views/index.jsx           ← Gantt, Analytics, Calendar, Vendors, POs, …
│   │                                                    (chunk: 'views')
│   ├── roadmap/index.jsx         ← Hierarchy, MaterialPrices, Compliance, Forecast,
│   │                               Delegations, Branding, AuditLogV2, … (chunk: 'roadmap')
│   ├── detail/index.jsx          ← 17 project sub-tabs + ClientShareView
│   │                                                    (chunk: 'detail')
│   └── org/index.jsx             ← 9 Org Admin panels    (chunk: 'org')
└── lib/                          ← 24 pure-function libs (no React imports)
    ├── permissions.js  ┐  Access model
    ├── projectTypes.js │   (3-layer gate)
    ├── orgFeatureFlags.js (37 features)
    ├── delegations.js  ┘
    ├── audit.js, blockchainAnchor.js   ← Audit chain
    ├── approvalChains.js, planGating.js, templates.js  ← Org Admin core
    ├── cashfree.js, razorpay.js        ← Billing
    ├── reraTelangana.js, compliance.js ← RERA / GST / EPFO
    ├── boqImport.js, exports.js        ← BOQ paste + CSV/PDF exports
    ├── projectArchive.js               ← Soft delete + 90-day restore
    ├── orgIntegrations.js, whatsapp.js ← Integrations
    ├── ai.js, aiForecast.js            ← LLM adapters (multi-language)
    ├── i18n.js                         ← en/te/hi label table
    ├── offline.js, usePersistent.js    ← IndexedDB + LS adapter
    ├── supabase.js                     ← Lazy client + probeConnection
    ├── hierarchy.js, dailySnapshot.js  ← Block→Floor→Unit + snapshot math
    ├── notifications.js, materialPrices.js, branding.js
    ├── format.js, escape.js, contractors.js, demoMode.js
```

The lib layer is **pure JavaScript**: no React imports, no fetches, all functions
testable in milliseconds. Every UI component imports its math from here. This is
why the test suite (438 tests) runs in under 4 seconds.

### 2.2 The 5 lazy chunks (vite.config.js)

| Chunk | First loaded when | What's in it | Why split |
|---|---|---|---|
| **main** | Login screen | shell + ui + ai + supabase + permissions | Cold path — must stay small |
| **org** | Click "Org Admin" gear | features/org + cashfree + approvalChains + templates | Only seen by org admins (~3% of users) |
| **roadmap** | Click any v2 view | features/roadmap + hierarchy/branding/forecast/etc. | Heavy and not used on dashboard |
| **views** | Open Gantt/Analytics/Calendar/POs | features/views + recharts | Recharts is 200+ kB by itself |
| **admin** | Super admin login | features/admin | <1 user/tenant ever sees this |
| **detail** | Open project detail | features/detail + 17 sub-tabs + ClientShareView | Big surface; only loaded on click |

Chunk seam at [vite.config.js:10-31](vite.config.js).
Every chunk is wrapped in `<Suspense fallback={…}>` + the top-level `ErrorBoundary`
catches load failures, so a broken chunk shows a friendly card instead of a white screen.

### 2.3 State model — `usePersistent`

There is **no Redux, no Zustand, no Context-of-Contexts**. State is managed by a single
hook, [src/lib/usePersistent.js](src/lib/usePersistent.js):

```js
const [projects, setProjects] = usePersistent("projects", INIT_PROJECTS)
```

Behaviour:

- **Demo mode** (`VITE_BACKEND` unset) → `localStorage` keyed by `sitetrack_v2:projects`.
- **Live mode** (`VITE_BACKEND=supabase`) → reads/writes Supabase tables on hydrate
  + on every change; subscribes via Supabase Realtime to push updates from other
  tabs/users.
- **Offline-first** (Capacitor or browser without network) →
  `queueOpAdd()` from [src/lib/offline.js](src/lib/offline.js) parks the mutation
  in IndexedDB; a connectivity listener flushes the queue on reconnect.

This is the single biggest architectural decision in the codebase. It means:

- New features just call `usePersistent("foo", INIT_FOO)` — no plumbing.
- The same component works in demo + live + offline without code changes.
- Every state slice gets free realtime sync, optimistic updates, and persistence.

### 2.4 Routing model

No `react-router`. Route state is a single string in `App.jsx`:

```js
const [view, setView] = usePersistent("view", "dashboard")
```

The orchestrator does a big `switch(view)` near the bottom of `App.jsx`,
returning the right lazy component. Project detail uses two extra state slices:
`projId` (selected) + `tab` (sub-tab inside detail).

Why no router? Three reasons:

1. **Telegram WebView + Capacitor + iframe embed** all behave well with state-based
   navigation; deep linking is rarely used by the field-worker persona.
2. **Save 14 kB** gzipped (react-router + history).
3. **Share view via URL** is implemented manually: `?share=<token>` activates
   `ClientShareView` regardless of auth state. See [App.jsx top-level effect](src/App.jsx).

Trade-off accepted: no browser back-button support across views. Acceptable for
the persona; revisit if/when we add public marketing pages inside the SPA.

### 2.5 Component composition pattern

```
App.jsx (orchestrator)
   │
   ├─ provides: state, setters, current user, audit recorder
   │
   ├─► LoginScreen          (signed-out)
   │
   └─► Sidebar + <ViewSwitch>
                 │
                 ├─► DashboardView        \
                 ├─► ProjectsView          │  shell chunk
                 ├─► CreateView           /
                 │
                 ├─► <lazy> GanttView          \
                 ├─► <lazy> AnalyticsView       │  views chunk
                 ├─► <lazy> CalendarView       /
                 │
                 ├─► <lazy> HierarchyView       \
                 ├─► <lazy> ComplianceView      │  roadmap chunk
                 ├─► <lazy> ForecastView       /
                 │
                 ├─► <lazy> SuperAdminDashboard \
                 ├─► <lazy> BillingAdminView    │  admin chunk
                 ├─► <lazy> UsersAdminView     /
                 │
                 ├─► <lazy> OrgFeatureSettingsView \
                 ├─► <lazy> OrgBillingView          │  org chunk
                 ├─► <lazy> OrgMembersView         /  (9 panels)
                 │
                 └─► <lazy> DetailView ──── 17 sub-tabs (detail chunk)
                                              │
                                              ├─ Overview / Tasks / Updates
                                              ├─ Materials / Vendors / POs / Invoices
                                              ├─ BOQ / RA Bills / Measurement Book / Ledger
                                              ├─ Labour / Drawings / Quality / Safety
                                              ├─ Permits / Submittals / Equipment / Diary
                                              └─ ClientShareView (public)
```

Every leaf component receives `setAuditLog` so audit is recorded close to the action.

### 2.6 Build pipeline

```
git push ──► Vercel webhook ──► Vercel build
                                    │
                                    ├─ npm ci
                                    ├─ npm run lint       (eslint 0 errors)
                                    ├─ npm run build      (Vite → dist/)
                                    ├─ npm run smoke      (320 line-level checks)
                                    └─ npm run test:unit  (438 vitest tests)
                                    │
                                    ▼
                              dist/ deployed
                                    │
                                    ├─► CDN: assets/index-<hash>.js
                                    ├─► CDN: assets/admin-<hash>.js
                                    ├─► CDN: assets/org-<hash>.js
                                    └─► HTML rewrites /* → /index.html
```

Mobile build pipeline is documented in §4.4.

### 2.7 Test pyramid

```
            ┌────────────────────────┐
            │  E2E (Playwright)      │  ~5 tests   (slow, real browser)
            └────────────────────────┘
          ┌────────────────────────────┐
          │  Smoke (line-level grep)   │  320 checks  (1 second)
          └────────────────────────────┘
        ┌─────────────────────────────────┐
        │  Unit (vitest, pure-lib only)   │  438 tests  (4 seconds)
        └─────────────────────────────────┘
      ┌──────────────────────────────────────┐
      │  Type-shape (jsdoc + import lint)    │  enforced via ESLint
      └──────────────────────────────────────┘
```

The smoke layer is unique: `scripts/ci/smoke.mjs` does literal-string assertions
against built bundles (e.g. "ROLE_META contains all 19 keys") — catching
deletions that pass unit tests but break the UI.

---

## 3. Product Architecture

> *"What does a user see, and what can they do?"*

### 3.1 The 3-tier role model

```
                            PLATFORM
                ┌──────────────────────────────┐
                │  super_admin   (us)          │
                │  support        (us)          │
                └──────────────┬───────────────┘
                               │ provisions
                               ▼
                              ORG (one builder firm)
              ┌────────────────────────────────────────┐
              │  org_owner       (founder of firm)     │
              │  org_admin       (managers)            │
              │  org_finance     (accountant)          │
              │  org_compliance  (RERA officer)        │
              └────────────────────────┬───────────────┘
                                       │ creates projects
                                       ▼
                                     PROJECT
            ┌────────────────────────────────────────────┐
            │  Construction-track:                       │
            │    pm, sitemanager, supervisor,            │
            │    architect (jr/sr/principal), engineer   │
            │    qs, safety, contractor, subcontractor   │
            │  Interior/Design/Consultant-track:         │
            │    designer, design-lead, drafter,         │
            │    consultant, principal-consultant        │
            │  External (read mostly):                   │
            │    client, vendor, finance-viewer          │
            └────────────────────────────────────────────┘
```

Currently 19 distinct roles. Each role has:

- A **PERMS** set: capability flags like `EDIT_PROJECT`, `APPROVE_RA_BILL`,
  `RECORD_LABOUR`, `EXPORT_AUDIT`, etc. Source: [src/lib/permissions.js](src/lib/permissions.js).
- A **ROLE_META** entry (label, accent colour, icon, default dashboard).
  Source: [src/components/ui.jsx](src/components/ui.jsx).
- A **MOCK_USERS** seed for demo mode.
- An RLS policy condition in SQL — see scripts/supabase/03_rls_phase1.sql.

### 3.2 The 3-layer access gate

Every feature is evaluated against three independent gates before render:

```
       canOpenView(user, view)        ← role gate     (lib/permissions.js)
                  │
                  ▼
       isFeatureEnabled(org, key)     ← feature flag  (lib/orgFeatureFlags.js)
                  │
                  ▼
       isTabApplicableToProjectType   ← type gate     (lib/projectTypes.js)
                  │
                  ▼
            render the view
```

Why three layers and not one?

- **Role** = "is this person allowed by their job" — invariant per session.
- **Flag** = "does this org pay for it" — set by Org Admin, gated by plan tier.
- **Type** = "is this tab even relevant" — a Design-only project doesn't need
  "Measurement Book"; a Construction project doesn't show "Mood Board".

Composing the three gives the firm fine-grained control without exploding the
permission matrix. See [docs/architecture/ROLE_MODEL_V2.md](docs/architecture/ROLE_MODEL_V2.md).

### 3.3 The 4 project types

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  CONSTRUCTION    │  INTERIOR        │  DESIGN          │  CONSULTANT      │
│                  │                  │                  │                  │
│ Highest-volume:  │ Fit-out / reno   │ Pure design firm │ Audit · QS ·     │
│ BOQ-driven,      │ Sub-contractor   │ Drawing-focused, │ PMC mandates     │
│ MB+RA cycle,     │ heavy, fewer     │ no construction  │ Cross-project    │
│ labour, RERA     │ structural tabs  │ ops              │ no team mgmt     │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ All 17 sub-tabs  │ 12 sub-tabs      │ 8 sub-tabs       │ 6 sub-tabs       │
│ default          │ (drops MB, RA,   │ (only Overview,  │ (Overview, Tasks,│
│                  │  Labour, Safety) │  Drawings,       │  Inspections,    │
│                  │                  │  Submittals,     │  Submittals,     │
│                  │                  │  Quality, …)     │  Quality, Audit) │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

The type is chosen on the CreateView 2x2 grid; defaults are in
[src/lib/projectTypes.js](src/lib/projectTypes.js).

### 3.4 The 9 Org Admin panels

Behind a single gear icon ([src/features/org/index.jsx](src/features/org/index.jsx)):

1. **Members** — Invite, role assign, bulk CSV import.
2. **Approval Chains** — Per-action approver lists with delegation windows.
3. **Templates** — Project / BOQ / Drawing template library.
4. **Integrations** — Cashfree, Razorpay, WhatsApp, Slack, MS Teams toggles.
5. **Billing** — Cashfree subscription, plan picker, invoice history.
6. **Notifications** — Per-event email/SMS/WhatsApp rules.
7. **Branding** — Logo, accent colour, letterhead PDF.
8. **Activity** — Full org-wide audit log + PDF export (Session 25 added).
9. **Feature Settings** — 37-feature toggle catalogue (Session 16).

### 3.5 The 17 project sub-tabs

(All in [src/features/detail/index.jsx](src/features/detail/index.jsx); each is a
top-level pure function with the same `(project, setProject, audit, …)` signature.)

```
Overview · Tasks · Updates · Materials · Vendors · POs · Invoices ·
BOQ · RA Bills · Measurement Book · Labour · Ledger · Drawings ·
Quality · Safety · Permits · Submittals · Equipment · Diary
```

(Diary and Equipment share their own visibility flag because some firms run a
"site diary" workflow and others don't.)

### 3.6 The 37-feature catalogue

The Session 16 feature flag system groups features into four buckets:

```
nav          (12)  ┌── show_calendar, show_gantt, show_analytics, show_messages,
                   │   show_vendors, show_pos, show_hierarchy, show_forecast,
                   │   show_compliance, show_material_prices, show_branding,
                   │   show_audit_log
tabs         (10)  ├── tab_bo, tab_ra, tab_mb, tab_labour, tab_safety, tab_quality,
                   │   tab_drawings, tab_permits, tab_submittals, tab_equipment
workflow      (8)  ├── workflow_approvals, workflow_delegations, workflow_templates,
                   │   workflow_notifications, workflow_offline, workflow_realtime,
                   │   workflow_quick_capture, workflow_ai_forecast
orgadmin      (7)  └── orgadmin_members, orgadmin_integrations, orgadmin_billing,
                       orgadmin_feature_settings, orgadmin_branding,
                       orgadmin_activity, orgadmin_approvals
```

Each flag is resolved through a **3-layer cascade**:

```
Platform kill-switch     (Super Admin)
        │   defaults  ◄──  if unset
        ▼
Org override             (Org Admin → Feature Settings)
        │   defaults  ◄──  if unset
        ▼
Catalogue default        (hard-coded in lib)
        │
        ▼  AND-ed with
Plan gate                (free / pro / business / enterprise)
        │
        ▼
isFeatureEnabled = true | false
```

Source: [src/lib/orgFeatureFlags.js](src/lib/orgFeatureFlags.js) + 29 tests.

### 3.7 The Indian-builder surfaces

Areas where SiteTrack is deliberately deeper than Procore / Powerplay:

| Surface | Why it matters | Where it lives |
|---|---|---|
| **BOQ paste-from-Excel** | Builders share BOQs as Excel, not CSV | [src/lib/boqImport.js](src/lib/boqImport.js) |
| **Measurement Book (MB)** | Required by PWD spec; foreign tools don't ship it | [features/detail/index.jsx](src/features/detail/index.jsx) — MeasurementBookTab |
| **RA Bill cycle** | Linked to MB + BOQ; running-account semantics | RABills tab + recordAudit on every approval |
| **Telangana RERA filing** | Stage-coded; portal scraping required | [src/lib/reraTelangana.js](src/lib/reraTelangana.js) + tg-rera-submit EF |
| **GSTIN / EPFO check** | Vendor onboarding gate | [src/lib/compliance.js](src/lib/compliance.js) |
| **UPI AutoPay (Cashfree)** | Cards have 3% MDR; UPI has near-zero | [src/lib/cashfree.js](src/lib/cashfree.js) |
| **WhatsApp daily-progress** | Site managers won't use email | [src/lib/whatsapp.js](src/lib/whatsapp.js) + Meta Cloud API runbook |
| **Telugu / Hindi labels** | Field workers don't read English | [src/lib/i18n.js](src/lib/i18n.js) + `LANG_INSTRUCTIONS` in lib/ai.js |
| **Quick-capture kiosk** | One-tap labour attendance from a tablet | DetailView LabourTab + permissions.canUseQuickCapture |
| **Letterhead PDF audit log** | Required for legal disputes | [src/lib/exports.js](src/lib/exports.js) → exportAuditPdf |

---

## 4. Mobile Architecture

> *"How does the same web codebase land on a Play Store .aab?"*

### 4.1 Strategy: Capacitor over React Native

Capacitor wraps the existing Vite-built SPA in a WebView with a thin native
plugin layer. We chose this over RN because:

- **Zero code rewrite** — the same React tree ships on web + mobile.
- **Native plugins on demand** — Camera, Geolocation, SplashScreen, In-App
  Updates are first-party Capacitor plugins.
- **Faster iteration** — UI tweaks ship as web bundle updates over CDN; only
  native plugin changes require a Play Store release.
- **Smaller team-of-one footprint** — one runtime to debug, not two.

The trade-off is that complex native gestures (e.g. AR kiosks) need careful
glue. For SiteTrack the AR layer is intentionally scaffolded only; we ship the
2D kiosk first.

### 4.2 Capacitor topology

```
┌─────────────────────────────────────────────────────────┐
│  Android APK / AAB                                      │
│  ┌─────────────────────────────────────────────────────┐│
│  │  WebView                                            ││
│  │  ┌────────────────────────────────────────────────┐ ││
│  │  │  Same dist/ from Vercel build                  │ ││
│  │  │  (bundled offline OR loaded from CDN)          │ ││
│  │  │                                                │ ││
│  │  │  ⇄  Capacitor JS bridge                        │ ││
│  │  └────────────────────────────────────────────────┘ ││
│  │             │                                       ││
│  │             ▼                                       ││
│  │  ┌────────────────────────────────────────────────┐ ││
│  │  │  Native plugins                                │ ││
│  │  │   · @capacitor/camera                          │ ││
│  │  │   · @capacitor/geolocation                     │ ││
│  │  │   · @capacitor/splash-screen                   │ ││
│  │  │   · @capacitor/preferences  (kiosk PIN, lang)  │ ││
│  │  │   · @capacitor/network      (offline detect)   │ ││
│  │  │   · @capacitor-community/in-app-updates        │ ││
│  │  └────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 4.3 Offline-first execution

Mobile is the persona where offline is non-negotiable (sites have patchy 4G).
Three layers cooperate:

```
            User taps "Mark attendance"
                       │
                       ▼
              usePersistent("attendance", …)
                       │
              ┌────────┴────────┐
              ▼                 ▼
        isOnline()? ── no ─► queueOpAdd(op)  ──► IndexedDB
              │ yes                                   │
              ▼                                       │
        Supabase REST upsert                          │
              │                                       │
              ▼                                       │
        ack → resolve                                 │
                                                      │
        ───────── network returns ───────────────────►│
                                                      ▼
                                          onConnectivityChange()
                                                      │
                                                      ▼
                                          flushQueue(op-by-op)
```

Sources: [src/lib/offline.js](src/lib/offline.js), [src/lib/usePersistent.js](src/lib/usePersistent.js).

### 4.4 Mobile build pipeline

```
npm run build                  ← Vite build → dist/
   │
   ▼
npx cap copy android           ← Copies dist/ into android/app/src/main/assets/public
   │
   ▼
npx cap sync android           ← Updates plugin manifests + gradle deps
   │
   ▼
cd android && ./gradlew bundleRelease
   │
   ▼
app/build/outputs/bundle/release/app-release.aab
   │
   ▼
Upload to Play Console
   │
   ├── Internal testing track   (real-device QA)
   ├── Closed testing track     (invited testers)
   └── Production track         (public)
```

See [docs/setup/PLAY_STORE_PREP.md](docs/setup/PLAY_STORE_PREP.md) for the 8-step submission runbook.

### 4.5 Mobile-specific UX variants

| Variant | Persona | Key features |
|---|---|---|
| **Standard app** | PM / Org Admin | Full SPA in WebView, gestures, native back |
| **Labour kiosk** | Site gate tablet | Locked to LabourTab + QuickCapture; no sidebar; pin-lock to exit |
| **Site-wall display** | TV in site office | Read-only dashboard rotation: progress / safety / weather / DPR |
| **AR overlay** *(scaffolded)* | Designer on-site | Camera + drawing overlay; deferred until v2 |

Kiosks set `?mode=labour-kiosk` or similar; the shell reads the URL once and
flips an internal flag that hides sidebar/topbar and forbids navigation away.

### 4.6 In-app update strategy

Critical for builders who never visit the Play Store. We use Google In-App
Updates:

```
App launches
    │
    ▼
plugin checks Play for new aab
    │
    ├─ critical update? ─► force install (blocking dialog)
    │
    └─ non-critical?    ─► snackbar "Tap to refresh"
```

This means a bug fix can ship without users opening the Play Store. CDN web
bundle updates ship even faster — but only for things that don't change native
plugins.

---

## 5. End-to-End Build-Up Plan

> *"In what order do you build all of this, from cold start to production?"*

This is the **composition order** — what depends on what, what must be true
before the next layer can ship.

### 5.1 The dependency DAG

```
                  ┌─────────────────────────────┐
                  │  S0. Repo + tooling         │
                  │  Vite · ESLint · vitest     │
                  └──────────────┬──────────────┘
                                 ▼
                  ┌─────────────────────────────┐
                  │  S1. Pure libs (lib/)       │
                  │  permissions · audit · i18n │
                  └──────────────┬──────────────┘
                                 ▼
                  ┌─────────────────────────────┐
                  │  S2. Seed data + lookups    │
                  │  MOCK_USERS · INIT_*        │
                  └──────────────┬──────────────┘
                                 ▼
                  ┌─────────────────────────────┐
                  │  S3. UI atoms               │
                  │  Ic · Av · Badge · ROLE_META│
                  └──────────────┬──────────────┘
                                 ▼
                  ┌─────────────────────────────┐
                  │  S4. Shell (login + side)   │
                  └──────────────┬──────────────┘
                                 ▼
                  ┌─────────────────────────────┐
                  │  S5. Feature chunks         │
                  │  views · roadmap · admin    │
                  │  org · detail               │
                  └──────────────┬──────────────┘
                                 ▼
        ┌────────────────────────┴────────────────────────┐
        ▼                                                 ▼
┌──────────────────────┐                  ┌──────────────────────────┐
│  S6a. Supabase wire  │                  │  S6b. Capacitor wrap     │
│  schema · RLS · auth │                  │  Android · plugins · .aab│
└─────────┬────────────┘                  └────────────┬─────────────┘
          ▼                                            ▼
┌──────────────────────┐                  ┌──────────────────────────┐
│  S7a. Edge functions │                  │  S7b. Play Store rollout │
│  cashfree · rera     │                  │  internal → closed → prod│
└─────────┬────────────┘                  └────────────┬─────────────┘
          ▼                                            ▼
       ┌──────────────────────────────────────────────────┐
       │  S8. Production launch                           │
       │  Vercel · DNS · sitetrackpro.in · sitetrackpro.in  │
       └─────────────────────┬────────────────────────────┘
                             ▼
       ┌──────────────────────────────────────────────────┐
       │  S9. Observability + customer onboarding         │
       │  Sentry · Statuspage · WhatsApp · CREDAI demos   │
       └─────────────────────┬────────────────────────────┘
                             ▼
       ┌──────────────────────────────────────────────────┐
       │  S10. Scale features                             │
       │  marketplace · SSO · custom fields · drawing-diff│
       └──────────────────────────────────────────────────┘
```

### 5.2 Why this order

- **S1 before everything** — pure libs are testable in isolation; bugs caught
  here never propagate. That's why we have 438 unit tests on 24 libs.
- **S2 before UI** — the UI is "render this seed". You can build every screen
  with zero backend.
- **S5 before S6** — the SPA must work in demo mode first. This guarantees the
  fallback path is real, not a marketing claim. Vercel can demo without
  Supabase configured.
- **S6a parallel to S6b** — Supabase and Capacitor are independent;
  one engineer can split a day across both.
- **S7a after S6a** — Edge Functions depend on the schema + RLS being live.
- **S7b after S6b** — Play Store needs a finished app first.
- **S8 deliberately late** — production launch is a *checklist event*, not a
  build step. Everything that ships in S0-S7 has been demo-mode-verified.

### 5.3 Composition principles

These are the laws that hold across all four architectural layers:

1. **Pure libs first, React second.** Every feature must be expressible as a
   pure function before it gets JSX. This is what made 438 tests possible.
2. **One state hook, no providers.** `usePersistent` is the only state primitive.
   This avoids React Context performance traps.
3. **3-layer access gate everywhere.** Role ∧ Feature flag ∧ Project type. No
   bypass even for super_admin (super_admin can *toggle* the flag, not skip it).
4. **Audit at the action site, not after.** Every mutator calls `recordAudit()`
   inline — not in a middleware. This makes the chain reviewable in PR diffs.
5. **Demo mode parity.** Every feature works in localStorage without Supabase.
   This is enforced by `npm run smoke` line-grep + the fact that CI doesn't
   touch a database.
6. **Lazy by default.** New screens go in a lazy chunk. The cold-path dashboard
   must not grow.
7. **Pure JavaScript, no TypeScript.** Trade-off accepted: faster iteration,
   smaller learning curve for contributors, no build-step type drift. Schemas
   live in JSDoc + runtime assertions where critical.
8. **No client-side secrets.** Anything sensitive lives in an Edge Function env
   var; the browser never sees it.

### 5.4 What a single feature looks like end-to-end

Example: **"Bulk-import a BOQ from Excel paste"** (Session 25).

```
Day 0  ── User pain: spreadsheets are how builders share BOQs
Day 1  ── Design: lib API   parseBoq(text) → { rows, headers, errors }
                            applyBoqImport(project, rows, opts) → project'
Day 1  ── Write tests       33 unit tests for parser + applier
Day 1  ── Implement lib     src/lib/boqImport.js   pure JS, no React
Day 2  ── UI                BOQTab adds: paste-area + preview modal + Append/Replace
                            DetailView wires setProject + recordAudit
Day 2  ── Smoke check       npm run smoke catches deletions
Day 2  ── Lazy chunk        already in 'detail' chunk — no new split
Day 3  ── i18n              en/te/hi strings added to lib/i18n.js
Day 3  ── Mobile            Capacitor WebView paste works out of the box;
                            kiosk variant unaffected (BOQ is not a kiosk surface)
Day 3  ── Backend           No new SQL — boq is part of projects.boq[]
                            RLS already covers it (projects table policy)
Day 4  ── Audit             recordAudit("boq_import_applied", {n_rows}) on apply
Day 4  ── Anchor            audit row gets included in next Polygon merkle batch
Day 5  ── Ship              git push → Vercel build → live
```

Note what's *not* needed: no new env var, no Edge Function, no migration, no
new chunk. This is the whole point of the layered architecture — small features
compose without churning infra.

### 5.5 What a backend-touching feature looks like

Example: **"Cashfree subscription onboarding"** (Session 15).

```
Day 0  ── Design: client → EF → Cashfree → webhook → EF → DB → realtime → client
Day 1  ── Pure lib      src/lib/cashfree.js
                            buildSubscriptionRequest()
                            verifyWebhookSignature() (Web Crypto HMAC SHA-256)
                            mapCashfreeStatus()
                            applyWebhookEvent()
Day 1  ── Tests         24 unit tests including signed-payload fixtures
Day 2  ── EF (subscription)  supabase/functions/cashfree-subscription/index.ts
                              imports _shared/cashfree.ts (Deno mirror of lib)
Day 2  ── EF (webhook)       supabase/functions/cashfree-webhook/index.ts
                              verifyHmac → applyWebhookEvent → INSERT subscriptions
Day 3  ── SQL                scripts/supabase/03_rls_phase1.sql adds subscriptions +
                              audit_log_v2 with SECURITY DEFINER append-only RPC
Day 3  ── UI                 features/org/index.jsx OrgBillingView shows "Live"
                              pill + plan picker + intent-flow button
Day 4  ── Realtime           subscribeTable("orgs") in App.jsx — plan badge
                              updates within seconds of webhook
Day 4  ── Docs               docs/setup/CASHFREE_ONBOARDING.md (8-week verification path)
Day 5  ── Sandbox test       test with Cashfree sandbox keys end-to-end
Day 6  ── Production         flip env to live; verify first ₹999 charge
```

Six discrete steps; each independently testable. This is the architectural
payoff — you never have a "big bang merge" where everything breaks at once.

---

## 6. Cross-Cutting Concerns

> *"The things every layer must respect."*

### 6.1 Security boundaries

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (untrusted)                                         │
│   · holds: VITE_SUPABASE_ANON_KEY, user JWT                  │
│   · CAN: read/write own tenant data via RLS                  │
│   · CANNOT: read other tenants, call privileged ops directly │
└──────────────────────────────────────────────────────────────┘
                          │
                          │ JWT in Authorization header
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Supabase REST / Realtime (semi-trusted)                     │
│   · enforces RLS via current_setting('app.tenant_id')        │
│   · audit_log_v2 INSERT only via SECURITY DEFINER RPC        │
│   · audit_log_v2 UPDATE/DELETE forbidden by row policy       │
└──────────────────────────────────────────────────────────────┘
                          │
                          │ webhook with HMAC sig
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Edge Functions (trusted server)                             │
│   · holds: service_role, Cashfree secret, Polygon key,       │
│            WhatsApp token, OpenAI key                        │
│   · verifies external webhooks cryptographically             │
│   · CORS allow-list (read from env, never wildcards in prod) │
└──────────────────────────────────────────────────────────────┘
                          │
                          │ explicit, narrow upsert
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Postgres (root of trust)                                    │
│   · RLS on every multi-tenant table                          │
│   · audit_log_v2 row policy: INSERT ALLOW, UPDATE DENY,      │
│                              DELETE DENY                     │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Audit trail — the spine

Every mutation goes through `recordAudit()`. The trail has four guarantees:

1. **Append-only in the DB** (SECURITY DEFINER RPC, row policy denies UPDATE/DELETE).
2. **Hashed per-row** (`hashAuditRow()` in blockchainAnchor.js).
3. **Merkle-rolled into a daily root** (`merkleRoot()` over the day's rows).
4. **Optionally anchored to Polygon mainnet** (`polygonAdapter.anchor(root)`).

This lets a customer prove that a given audit row existed at time T without
revealing it. Critical for RERA disputes and arbitration.

### 6.3 i18n — three languages, one bundle

`src/lib/i18n.js` exports `t(key, lang)`. The full UI is keyed; field workers
see Telugu or Hindi based on `user.lang`. Crucially, the **AI lib also takes
lang**: `forecastWithLlm(…, {lang})` injects a system instruction that forces
the LLM to respond in the requested language. This lets WhatsApp DPR
auto-summaries land in Telugu without per-customer prompts.

### 6.4 Error handling

Three-tier defence:

1. **ErrorBoundary at root** in main.jsx — catches lazy chunk failures, Rules-of-Hooks
   bugs, null dereferences. Renders a reload card; never white screens.
2. **ErrorBoundary per feature** — wraps each `<Suspense>` boundary so a broken
   org chunk doesn't take down dashboard.
3. **Pure-lib invariants** — every lib returns `{ ok: bool, …}` rather than
   throwing on user errors. The UI surfaces `reason` strings.

### 6.5 Performance budget

| Cold path | Target | Current | Note |
|---|---|---|---|
| dashboard.js (gzipped) | ≤ 200 kB | ~180 kB | After lazy split |
| First Contentful Paint | ≤ 1.5 s | ~1.2 s | On 4G, no service worker |
| Time to Interactive | ≤ 3 s | ~2.4 s | On Pixel 6a mid-tier device |
| API p95 (Supabase) | ≤ 200 ms | n/a yet | Add Better Stack synthetic |

### 6.6 Migration discipline

SQL files are numbered + idempotent:

```
01_schema.sql                ← initial tables + indexes
02_rls.sql                   ← per-table policies
03_rls_phase1.sql            ← orgadmin role + audit_log_v2 + RPCs
04_rls_tests.sql             ← assertions
05_rls_phase1_tests.sql      ← Phase 1 assertions (24+)
06_project_types.sql         ← project_type column + default
07_role_expansion.sql        ← 12 new roles in role_enum
08_project_archive.sql       ← archived_at column + index
```

Every file wraps in `do $$ … $$` and uses `if not exists`/`create or replace`
so re-running the directory in order never errors.

---

## 7. Architecture Decision Records (ADRs)

Brief versions; expand each into its own ADR file if/when challenged.

| # | Decision | Why | Alternative rejected |
|---|---|---|---|
| 1 | **Single SPA in React** (no Next.js) | One-person team, no SSR needs, no SEO blockers (marketing is separate) | Next.js / Remix → adds build complexity |
| 2 | **Vite (rolldown)** | Fast cold-build, ESM-native, simple manualChunks | Webpack/CRA → slow, locked in |
| 3 | **No TypeScript** | Velocity, simpler contributor onboarding | TS → real benefit at 10+ engineers, not now |
| 4 | **No Redux / Zustand** | One state hook + lazy chunks beats global store | Redux → boilerplate; Zustand → fine but unnecessary |
| 5 | **Supabase over self-hosted Postgres** | RLS + auth + realtime + storage + EFs in one bill | Self-host → ops cost too high for solo |
| 6 | **RLS not API gateways** | Each table policy is one line; no glue server | API gateway → another deploy target |
| 7 | **Capacitor over RN** | Single codebase | RN → two codebases |
| 8 | **No router** | State-based switch saves 14 kB | react-router → unused features |
| 9 | **Pure-lib first** | Tests run in 4 s | Component tests → slow, brittle |
| 10 | **Cashfree (UPI), not Stripe** | India market, lower MDR | Stripe → 3% MDR + ₹2/txn |
| 11 | **Polygon anchoring** | Cheap (₹0.01/tx), final, public | Ethereum → 1000x cost |
| 12 | **WhatsApp Cloud API** | Builders use WhatsApp daily | SMS → no read receipts; in-app push → not used |

---

## 8. What's NOT Built Yet (honest scoreboard)

To keep the architecture honest, here are surfaces that are **scaffolded but
not production-ready**:

| Item | State | Where it's stubbed |
|---|---|---|
| Polygon anchoring | Lib + tests live; **Solidity contract not deployed** | [src/lib/blockchainAnchor.js](src/lib/blockchainAnchor.js) — `polygonAdapter` returns mock tx |
| WhatsApp send | Lib live, **EF not wired** | [src/lib/whatsapp.js](src/lib/whatsapp.js) + runbook only |
| Telangana RERA submit | EF stub + adapter live; **portal scraper disabled by feature flag** | [supabase/functions/tg-rera-submit/](supabase/functions/tg-rera-submit/) gated by `TG_RERA_SCRAPER_ENABLED` |
| Cashfree EFs | Code complete + 24 tests; **not deployed to prod** | Awaiting account approval |
| AR drawing overlay | Scaffold only | DetailView Drawings tab placeholder |
| Sentry | Not installed | Phase 2 of execution plan |
| SSO (SAML/OIDC) | Not started | Phase 5 |
| Custom fields | Not started | Phase 5 |
| Vendor marketplace | Not started | Phase 5 |
| Drawing-diff | Not started | Phase 5 |

This list is identical to the "honest claims" disclosure in
[docs/business/COMPETITOR_COMPARISON_V2.md](docs/business/COMPETITOR_COMPARISON_V2.md).

---

## 9. Future Evolution

Two-year horizon (no commitments — directional only):

```
2026 H1   ── Production launch, first 10 paying orgs, vendor marketplace MVP
2026 H2   ── SSO + custom fields + drawing-diff; 100 orgs; iOS launch
2027 H1   ── BIM viewer + 4D scheduling; ₹10 lakh ARR
2027 H2   ── Multi-region (Hyderabad + Mumbai data residency split)
```

The architecture is intentionally **boring** in the load-bearing places (Vercel
+ Supabase + Vite + React) so that the interesting work is in the **product
surfaces** (BOQ paste, MB-RA cycle, Telugu DPR, Polygon anchor, kiosks). When a
piece of the boring layer becomes a bottleneck, we replace it — not before.

---

## 10. Glossary

- **BOQ** — Bill of Quantities. The line-item budget for a construction project.
- **RA Bill** — Running Account bill. Sub-contractor invoice tied to MB.
- **MB** — Measurement Book. Append-only ledger of physical site measurements
  required by PWD spec.
- **RERA** — Real Estate (Regulation and Development) Act. State-level filings
  required for every real estate project sold in India.
- **CREDAI** — Confederation of Real Estate Developers' Associations of India.
- **DPR** — Daily Progress Report.
- **PMC** — Project Management Consultant.
- **QS** — Quantity Surveyor.
- **PWD** — Public Works Department.
- **UPI** — Unified Payments Interface (Indian instant-payment rail).
- **EF** — Edge Function (Supabase Deno runtime).
- **RLS** — Row-Level Security (Postgres).
- **Anchor** — Writing a hash to a public blockchain to fix it in time.

---

## 11. Quick-Reference Index

| Need to know about | Read |
|---|---|
| How to connect to Supabase | [docs/setup/CONNECT_SUPABASE.md](docs/setup/CONNECT_SUPABASE.md) |
| How to deploy to production | [docs/setup/DEPLOY_NOW.md](docs/setup/DEPLOY_NOW.md) |
| Cashfree onboarding paper-trail | [docs/setup/CASHFREE_ONBOARDING.md](docs/setup/CASHFREE_ONBOARDING.md) |
| WhatsApp Business API verification | [docs/archive/WHATSAPP_BUSINESS_API.md](docs/archive/WHATSAPP_BUSINESS_API.md) |
| Play Store submission | [docs/setup/PLAY_STORE_PREP.md](docs/setup/PLAY_STORE_PREP.md) |
| Role model v2 details | [docs/architecture/ROLE_MODEL_V2.md](docs/architecture/ROLE_MODEL_V2.md) |
| Production RLS configuration | [docs/architecture/PRODUCTION_RLS.md](docs/architecture/PRODUCTION_RLS.md) |
| Competitor feature matrix | [docs/business/COMPETITOR_COMPARISON_V2.md](docs/business/COMPETITOR_COMPARISON_V2.md) |
| 90-day execution plan | [docs/planning/EXECUTION_PLAN_90_DAYS.md](docs/planning/EXECUTION_PLAN_90_DAYS.md) |
| HRMS deployment-pattern study | [docs/setup/HRMS_DEPLOYMENT_STUDY.md](docs/setup/HRMS_DEPLOYMENT_STUDY.md) |
| MCP toolkit overview | [docs/integrations/MCP_TOOLKIT.md](docs/integrations/MCP_TOOLKIT.md) |

---

*Last updated: Session 26 (2026-05-31).  Maintainer: Mohan Boyapati.*  
*This doc is canonical. If code disagrees, file an issue and update the doc in the same PR.*
