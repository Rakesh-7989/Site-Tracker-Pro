# SiteTrack Pro

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](tsconfig.json)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](package.json)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](package.json)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss)](package.json)
[![CI](https://github.com/Rakesh-7989/Site-Tracker-Pro/actions/workflows/ci.yml/badge.svg)](https://github.com/Rakesh-7989/Site-Tracker-Pro/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

**A construction control system for Indian builders.** Daily progress, spend, drawings and risk from every site — in one workspace, answered in Telugu, Hindi or English.

**Live**: [sitetrackpro.in](https://sitetrackpro.in) (authed app + public marketing site: `/`, `/product`, `/pricing`, `/solutions/:slug`, `/resources`, `/blog`, `/security`, `/contact`).

Built for construction-native work, not a generic project tool forced to fit: **voice daily progress reports** dictated in Telugu/Hindi/English with geotagged photos, **RA bills and invoices with GST/TDS**, **RERA stage tracking**, **drawing registers with CAD preview and revision diffs**, **risk signals computed nightly**, and an **offline-first, WhatsApp-friendly field app** that works on poor signal.

---

## Features

### Industry modules (14)
The product is a module platform: each organisation enables the modules it needs (per-industry templates for construction / architecture / interior / consultancy).

| Module | What it does |
|--------|--------------|
| **Projects & Execution** | Multi-project portfolio, milestones, tasks, boards, calendar, updates, issues, RFIs and change orders |
| **Client Portal** | Client dashboard, portal access, handover sign-off |
| **Site Operations** | Daily progress reports (voice + geotagged photos), punch lists, submittals, permits, inspections, measurement book |
| **Design Studio** | Drawing register with revision control, CAD (DXF) preview + compare, FF&E schedules, design review rounds |
| **Consultancy Engagements** | Fixed-fee phases, billable time, deliverables, review rounds, utilization |
| **Finance & Billing** | Budgets vs actuals, expenses, invoices, RA bills, retainers, hourly billing, revenue |
| **Procurement** | Vendors, purchase orders, goods receipts → GRN into inventory, quote comparison + scoring |
| **Compliance & NOC** | Statutory approvals / NOC register with expiry tracking, RERA / GST / EPFO filings |
| **People & HR** | Attendance, shift rosters, overtime, wages + EPF/ESI, labour register, org hierarchy, worklogs |
| **Analytics & Insights** | Org analytics, cash-flow forecast, utilization/revenue, risk signals, activity feeds, download audit |
| **Kiosks & AR** | Labour kiosk, site wall, AR drawing overlay, daily snapshot |
| **CRM & Sales** | Leads → meetings → quotations → agreements → client, owner-based pipelines, sales→project handoff |
| **Research Library** | Construction literature repository — IS/ASTM standards, papers, datasheets, method statements |
| **Spatial Hierarchy** | Site → Building → Floor → Zone → Room hierarchy for field operations |

### Core platform
- **Multi-organisation, multi-segment** — one login, many organisations (a consultant's practice *and* each client project stay isolated); organisations pick one or many of construction / architecture / interior / consultancy.
- **22 identity roles** + **RBAC v2** — org admins wield fine-grained capability grants and custom roles on top of the built-in matrix; every UI action and route is capability-gated.
- **Plan-based gating** — feature visibility and quotas driven by the subscription plan (basic / pro / business / enterprise).
- **Row-level security** — every read/write is tenant-scoped at the Postgres RLS layer with an immutable, grant-locked audit trail. Automated cross-tenant, lifecycle and concurrency test harnesses run against the live DB in CI.
- **Voice-first reports** — the field dictates DPRs; transcription + photos land together. Works offline, syncs when signal returns.
- **Offline-capable PWA + Android** — installable web app; Capacitor 8 Android shell (`in.sitetrackpro.app`) with native camera, GPS and share sheet.
- **i18n** — Telugu, Hindi and English (29 namespaces, 858 keys per language, key-set parity enforced).
- **Dependency-free charts** — SVG bar/pie/line/grouped-bar library on design-system tokens (no chart-lib dependency).
- **PDF & CSV export** — A4 PDFs (DPR, monthly statement) and RFC-4180 CSV exports with formula-injection defusal.
- **Email delivery** — transactional + nightly promoter digests via Resend (`hello@sitetrackpro.in`); GoTrue SMTP confirmation/otp/reset emails.

### Billing & payments
- 14-day trial on self-service signup ([register](https://sitetrackpro.in/register)) → plan upgrade via **Cashfree** subscription; one-off invoice payments via **Razorpay** payment links; GST invoicing through the GSTN e-invoice path.

### Marketing site
A public site (site data in `src/features/marketing/site/`) mirrors every shipped capability with honest copy — price cards match `src/auth/plans.ts`, roles match reality, and only shipped functionality is described. Landing pages for Solutions and a Hyderabad local page (`/construction-software-hyderabad`) are included, with SPA-safe SEO (titles/OG/JSON-LD) and `/sitemap.xml`, `/robots.txt`, `/llms.txt`.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 (+ React Router 7) |
| Build | Vite 8 (code-split; views lazy-loaded via a plugin route catalog) |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 3 + design-system tokens (`--st-*` CSS variables, light/dark themes) |
| Charts | Custom dependency-free SVG charts |
| Backend | Supabase (Postgres + auth + RLS + 27 Edge Functions in `supabase/functions/`) |
| Database | Postgres with ~250 versioned migrations in `scripts/supabase/` (v1–v253, ledgered + live-applied) |
| Identity | Supabase Auth (GoTrue, custom SMTP via Resend) |
| Mobile | Capacitor 8 (Android), native camera / GPS / network / share plugins |
| i18n | Custom slice-based system (en / hi / te) |
| Export | jsPDF, custom CSV library |
| Monitoring | Sentry |
| CI/CD | GitHub Actions (lint · typecheck · build · smoke · ~3,100 unit tests · coverage · e2e-mock · live-DB RLS harnesses) → Vercel |
| Hosting | Vercel (production, `sitetrackpro.in`); PWA service worker + `/v2/`-less single bundle |

---

## Quick start

```sh
npm install
npm run dev
```

Open http://localhost:5173

Supabase URL + public anon key are hardcoded in `src/lib/supabase/supabasePublicConfig.ts`, so the app runs without env files. Use `/register` to self-sign-up (real auth, 14-day trial); the sign-in screen is at `/login`. For DB/migration/RLS tooling, populate `.env.local` from `.env.example` with `SUPABASE_DB_URL` / `SUPABASE_ACCESS_TOKEN`.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Full gate: lint + typecheck + build + smoke + unit |
| `npm run test:unit` | Vitest unit + component tests |
| `npm run test:unit:coverage` | Vitest with coverage thresholds |
| `npm run test:e2e:mock` | Playwright mocked-role E2E (CI-runnable, no creds) |
| `npm run test:a11y:strict` | axe-core accessibility audit (fails on serious/critical) |
| `npm run test:rls` | Live-DB RLS harnesses (self-service, spatial, RBAC v2 shadow) |
| `npm run test:rls:cross-tenant` | 506-assertion cross-tenant isolation matrix (live DB) |
| `npm run test:rls:partners` / `:lifecycle` / `:quota` / `:risk` / `:teams` / `:versions` / `:finance` | Targeted live-DB RLS harnesses |
| `npm run lint` | ESLint (TypeScript strict; Edge Functions excluded — Deno) |
| `npm run typecheck` | TypeScript check |
| `npm run format` | Prettier |
| `npm run smoke` | Repo-consistency gate (~471 checks: markers, migrations, doc references) |
| `npm run db:apply` | Apply `scripts/supabase/*.sql` migrations in order (ledgered) |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` from the live DB |
| `npm run check:columns` | Column-drift gate (repo vs live DB) |
| `npm run check:definer` | SECURITY DEFINER search-path gate |
| `npm run check:rls:coverage` | RLS coverage gate |
| `npm run prod:smoke` | Live prod smoke: landing, Supabase REST, signup EF |
| `npm run uptime` | Live uptime probe (frontend + backend) |
| `npm run mobile:build` | Web build + Capacitor sync for Android |

---

## Project structure

```
Site-Tracker-Pro/
  src/
    app/            Query modules, router, plugin route catalog, nav config
    auth/           Auth, RBAC capability matrix, plan caps, session hydration
    components/     Shared UI components + dependency-free charts
    features/       14 feature areas (account, admin, auth, dashboards, dpr,
                    handover, kiosk, marketing, org, project, pwa, share, shared, shell)
    i18n/           Translations (en, hi, te — 858 keys each)
    lib/            Utilities (supabase types, offline queue, dxf, csv, pdf, ...)
    modules/        Module registry + templates (14 modules)
    plugins/        Plugin catalog (module → route ownership)
  supabase/
    functions/      27 Edge Functions + shared libs (cors, auth, clients)
  scripts/
    supabase/       ~250 versioned SQL migrations (v1–v253)
    ci/             smoke, column-drift, definer, RLS-coverage, prod-smoke...
    tests/          Live-DB RLS test harnesses
    db/             Migration applier, schema-type generator
    deploy/         Infrastructure tooling (Vercel, Resend, Supabase config)
  docs/             123 documents (architecture, business, QA, planning, setup)
  tests/            Vitest unit + component suites
  e2e-mock/         Playwright mocked-role E2E + a11y + UX audits
  android/          Capacitor Android shell
```

---

## Testing & CI

Every push to `main`/`prod` runs three parallel workflows:

| Job | What it does |
|-----|--------------|
| `test` | Git-clean install → lint → typecheck → build → smoke (~471 checks) → **~3,100 unit/component tests** → stray-artifact guard |
| `e2e-mock` | Playwright chromium — real router + shell with 6 mocked roles, **11/11** |
| `coverage` | Vitest coverage (logic layers) with thresholds |

Plus live-DB RLS harness steps (`test:rls:*`) and a nightly regression with uptime probe. The security posture is machine-checked: tenant isolation (506 assertions), project lifecycle, versioned concurrency, financial invariants, quota TOCTOU, SECURITY DEFINER search paths, column drift, and RLS coverage all fail the build if violated.

---

## Deployment

Production runs on **Vercel** via the GitHub `prod` branch (Git integration auto-deploys; the `deploy.yml` workflow exists for staging previews + post-deploy smoke). Migrations are applied to the live Supabase project from the repo (`npm run db:apply`) before release; Edge Functions deploy from `supabase/functions/`.

| Platform | Notes |
|----------|-------|
| **Vercel** (production) | Canonical; domain `sitetrackpro.in` |
| Any static host | `npm run build` → serve `dist/` (PWA + SPA fallback via `_redirects`-style rewrite) |

---

## Documentation

All project documentation lives in `docs/`:

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Modules & segmentation](docs/architecture/MODULES.md)
- [Security audit register](docs/architecture/SECURITY_AUDIT_REGISTER.md)
- [End-to-end plan](docs/planning/END_TO_END_PLAN.md)
- [Agentic SDLC operating model](docs/planning/AGENTIC_SDLC.md)
- [Business model](docs/business/BUSINESS_MODEL.md)
- [Pricing](docs/business/PRICING.md)
- [Market analysis](docs/business/MARKET_ANALYSIS.md)
- [Signup & login guide](docs/setup/SIGNUP_LOGIN_GUIDE.md)
- [Deploy now](docs/setup/DEPLOY_NOW.md)
- [User guide](docs/USER_GUIDE.md)
- [QA playbook](docs/qa/QA_PLAYBOOK.md)
- [Roadmap archive](docs/archive/SITETRACK_V3_PLAN.md)
- [Backend plan (archive)](docs/archive/BACKEND_PLAN.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

---

## License

[MIT](LICENSE)

Copyright (c) 2026 SiteTrack Pro