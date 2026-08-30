# SiteTrack Pro

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](tsconfig.json)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](package.json)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](package.json)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss)](package.json)
[![CI](https://github.com/Rakesh-7989/Site-Tracker-Pro/actions/workflows/ci.yml/badge.svg)](https://github.com/Rakesh-7989/Site-Tracker-Pro/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

Construction site management web app with role-based access (Architect / PM / Contractor / Client), 20+ modules, India-ready compliance (GST/TDS, EPF/ESI, RERA), multilingual UI (Telugu / Hindi / English), and offline-capable PWA.

---

## Features

### Core modules
| Module | Description |
|--------|-------------|
| **Projects** | Multi-project dashboard with milestones, Gantt, budget tracking |
| **Drawings** | Revision-controlled drawing release with role-based visibility |
| **Issues & Punch List** | Track site issues, punch list items with threaded comments |
| **RFI** | Request for Information workflow (PM raises, Architect answers) |
| **Change Orders** | Scope/cost/time impact tracking with client approval |
| **Inspections & QC** | Custom checklists (pre-pour, MEP, safety, closeout) |
| **Materials** | Stock ledger with inward/outward/return/wastage, GRN/DC references |
| **Vendors DB** | Global supplier directory with GSTIN, ratings, purchase orders |
| **BOQ** | Bill of Quantities with line items, category totals, client read-only |
| **RA Bills** | Subcontractor running account bills with retention |
| **Invoices** | Milestone-based billing with GST + TDS |
| **Labour Register** | Statutory worker register (Aadhaar, EPF, ESI, daily wage) |
| **Budget** | Project budgeting with expense tracking |
| **Safety Incidents** | OSHA-style reporting (near miss, first aid, injury, fatal) |
| **DPR** | Daily Progress Reports with photo metadata (GPS + timestamp) |

### Cross-cutting features
- **Global Search** — across projects, milestones, issues, vendors
- **Calendar** — cross-project deadlines (milestones, tasks, invoices)
- **Today's Entry** — quick field capture for updates, issues, worklogs
- **Comments** — threaded discussion on issues and RFIs
- **WhatsApp Share** — share project status directly via WhatsApp
- **Analytics** — dependency-free SVG chart dashboards with project health insights
- **Dark mode** — full dark theme support
- **PWA** — installable, works offline (cached shell)
- **i18n** — Telugu, Hindi, English UI toggle
- **PDF/CSV Export** — export reports and data

### Access control
- **Role-based access** — Architect, PM, Contractor, Client, Super Admin, Staff
- **Plan-based gating** — feature visibility by subscription plan
- **Capability-based permissions** — fine-grained action-level guards
- **Role-safe share links** — client search/detail/share scoped to assigned projects

---

## Quick start

```sh
npm install
npm run dev
```

Open http://localhost:5173

Demo login: 4 roles available on the login screen — no password required.

| Role | Description |
|------|-------------|
| Architect | Full access, releases drawings |
| PM (Priya Sharma) | Site ops, attendance, issues, materials |
| Contractor (Karthik Builders) | Field uploads, RFIs, worklogs, RA bills |
| Client (Vikram Nair) | Read-only progress, drawings, invoices |

---

## Screenshots

_Coming soon. Run the app and explore the demo data to see all features._

---

## Project structure

```
site-tracker-pro/
  src/
    app/            Query modules, router, navigation config
    auth/           Auth system (capabilities, roles, PlanGate, guards)
    components/     Shared UI components
    features/       14 feature modules (account, admin, auth, dashboards, dpr, handover, kiosk, marketing, org, project, pwa, share, shared, shell)
    i18n/           Translations (en, te, hi)
    lib/            Utilities (permissions, supabase, export, format, ...)
  supabase/
    functions/      25 Edge Functions
  docs/             100+ documents (architecture, sales, research, setup)
  tests/            Unit tests (Vitest) + E2E (Playwright)

```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build → `dist/` |
| `npm test` | Full pipeline: lint + typecheck + build + smoke + unit tests |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript check |
| `npm run format` | Prettier format |

---

## Deployment

The app can be deployed to any static host:

| Platform | Config |
|----------|--------|
| **Vercel** | Auto-detected (`vercel.json`) |

| **Cloudflare Pages** | Build: `npm run build`, output: `dist` |
| **GitHub Pages** | Set `base` in `vite.config.js` |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build | Vite 8 |
| Styling | Tailwind CSS 3 |
| Charts | Custom dependency-free SVG charts |
| Storage | Browser localStorage (demo), Supabase (production) |
| Mobile | Capacitor (Android/iOS wrapper) |
| Auth | Supabase Auth + RBAC |
| i18n | Custom (en/te/hi) |
| CI | GitHub Actions |
| Monitoring | Sentry |

---

## Documentation

All project documentation lives in `docs/`:

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Business model](docs/business/BUSINESS_MODEL.md)
- [Pricing](docs/business/PRICING.md)
- [Backend plan](docs/archive/BACKEND_PLAN.md)
- [Market analysis](docs/business/MARKET_ANALYSIS.md)
- [Roadmap](docs/archive/SITETRACK_V3_PLAN.md)
- [Signup & login guide](docs/setup/SIGNUP_LOGIN_GUIDE.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

---

## License

[MIT](LICENSE)

Copyright (c) 2026 SiteTrack Pro
