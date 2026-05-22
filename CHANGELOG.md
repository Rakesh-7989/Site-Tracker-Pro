# SiteTrack Pro Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning will start when the first paid pilot ships.

## [Unreleased]

### Added — Super Admin (Operations) role for multi-tenant coordination
- New 5th role `superadmin` in `src/lib/permissions.js` with admin-only capabilities (manageUsers, manageOrgs, manageBilling, manageSettings, impersonate) and dedicated nav (admin-dashboard, admin-orgs, admin-users, admin-billing, admin-settings).
- `INIT_ORGS` (5 mock customer orgs across Hyderabad/Bangalore/Chennai/Kochi/Pune with mixed Basic/Pro/Business/Trial plans) + `INIT_ADMIN_USERS` (15 mock users across roles) + `PLAN_META` (Basic ₹999, Pro ₹2999, Business ₹7999, Custom).
- Login screen now shows **5 role tiles** including "Super Admin (Operations)" with slate-gold styling that signals operations-grade vs editorial-grade.
- Sidebar splits into **— Operations** (admin-only) and **— Tenant view** (everyone) sections for superadmin.
- 5 new editorial-styled admin views:
  - **SuperAdminDashboard**: MRR hero card, plan distribution bars, recent signups, churn-risk callout (orgs with no activity in 7 days), cross-org activity feed.
  - **OrgsAdminView**: list with plan/MRR/users/projects/status; inline plan change, suspend/activate, "Add Organization" with 15-day trial default.
  - **UsersAdminView**: search + role filter, invite flow, inline role change, deactivate/reactivate, super-admin row is protected from edits.
  - **BillingAdminView**: total MRR + ARR + active/trial/suspended chips, revenue mix by plan with share-of-MRR bars, Razorpay Subscriptions roadmap callout.
  - **SettingsAdminView**: toggle 6 feature flags (drawing markup, AI, DPR auto, WhatsApp, e-sign, offline queue) + integration status panel (Anthropic/OpenAI, Razorpay UPI, Supabase, WhatsApp Business, GitHub Actions CI).
- `scripts/supabase/01_schema.sql`: profiles.role check constraint now includes `superadmin`.
- `scripts/supabase/02_rls.sql`: new `is_superadmin()` helper, `user_project_ids()` unions in all projects for superadmin, new policies on `organizations`, `org_members`, `profiles` (read) for cross-tenant admin access.
- `scripts/supabase/04_rls_tests.sql`: Scenario 6 — 6 assertions verifying super admin sees both Alpha + Beta, can read organizations table, can insert projects.
- `docs/AGENTS.md`: ownership table now defines Super Admin role at the top of the boundaries section.
- `docs/BACKEND_PLAN.md`: schema diagram includes `superadmin` as a role value.
- 10 new vitest cases covering PERMS shape, isSuperAdmin, cross-tenant overrides, admin nav visibility, quick-capture extension.

### Added — Competitive weaknesses pack (closes 9 gaps vs Powerplay/RDash/Procore)
- **Daily Report (DPR) PDF + WhatsApp share** (gap #5): Editorial-styled HTML→PDF auto-built from today's updates/issues/materials/worklogs/attendance/photos. WhatsApp button opens `wa.me` with formatted summary. Closes Powerplay's #1 hook for India market.
- **Measurement Book → RA Bills** (gap #8): Expandable MB grid per RA bill with location, item, qty, unit, rate. Auto-computed amount, drift detection vs bill total, "Set bill = MB total" recomputation. Closes RDash contractor-billing gap.
- **E-signature for change orders** (gap #7): Typed-name + consent-checkbox + timestamp + role + user-agent capture. Signature card renders inline with the change order. Closes CoConstruct gap.
- **Drawing markup viewer** (gap #2): Canvas overlay on image attachments with 4 colors, 3 widths, undo, clear, save. Marked-up image becomes a new attachment with `markup_of` link. Closes PlanGrid/Procore phone-redline gap.
- **Offline-first IndexedDB layer + sync queue** (gap #4): New `src/lib/offline.js` with IDB blob store, sync queue, online/offline event listener. Top bar shows offline pill + pending-op count. Site update writes queue ops when offline. Closes Onsite/Powerplay gap (Phase 1).
- **AI Insights LLM upgrade** (gap #10): New `src/lib/ai.js` with deterministic risk-score engine + Claude/OpenAI integration. Settings panel inside AI tab to paste API key (stays in browser). Editorial narrative summary on demand. Closes Procore Agent Builder direction.
- **Razorpay UPI payment** (gap #6): New `src/lib/razorpay.js` with UPI deep-link builder + Payment Link request payload. Architect configures UPI ID once → every invoice gets a "Pay via UPI" button for clients. Closes Buildertrend/Houzz Pro payment loop.
- **Capacitor native mobile scaffold** (gap #3): `capacitor.config.json` + comprehensive `docs/MOBILE_BUILD.md` with plugin list, app-store flow, known gotchas. Build to iOS/Android with one `npx cap sync`.
- **Supabase persistence switch** (gap #1 prep): `src/lib/supabase.js` with `BACKEND_MODE` env flag, dynamic SDK import (no bundle bloat in demo), table mapping for all `INIT_*` keys. `.env.example` documents activation.
- **ESLint flat config (ESLint 9)** + **Prettier** with `npm run lint`, `lint:fix`, `format`, `format:check` scripts. `npm test` now runs lint first. CI workflow upgraded from placeholder to real lint step.
- **`scripts/supabase/04_rls_tests.sql`** — 18-assertion RLS verification matrix across 4 roles (Architect/PM/Contractor/Client) covering project visibility, drawing released_to rules, financial table isolation, PII access, and write blocking for clients. Tech Lead gate #2 closed.
- **Estimate tab** (feature #18 in 50-feature matrix): generates client-facing quote from BOQ totals with editable markup/overhead/contingency/GST percentages. Versioned per save. Architect/PM edit; Client read-only; Contractor hidden.
- `src/lib/permissions.js` — single source of truth for PERMS + role helpers. App.jsx imports from here so the two cannot drift.
- `scripts/supabase/01_schema.sql` + `02_rls.sql` + `README.md` — runnable Supabase schema and RLS policy templates per Backend Engineer Agent's plan.
- BOQ tab (Bill of Quantities) with code, description, category, unit, qty, rate; category totals + grand total. Architect/PM edit, Client read-only, Contractor hidden.
- Stock Ledger tab with inward/outward/return/wastage transactions; material-wise balance summary; balance turns red when negative. Architect/PM/Contractor edit, Client hidden.
- Photo metadata capture (date/time + opt-in GPS) on site update photos. Geolocation behind a "Tag photos with site location" toggle — no surprise permission popups.
- `CHANGELOG.md` (this file), `docs/BACKEND_PLAN.md`, `docs/CI_WORKFLOW.yml`, `docs/CI_SETUP.md`.
- GitHub Actions CI workflow as a docs/ template (manual move documented in `docs/CI_SETUP.md` once a `workflow`-scoped token is available).
- Vitest scaffold + 24 unit tests covering PERMS shape, role boundaries, project visibility, view routing, drawing release logic.

### Changed
- `drawingKey({})` now returns `null` instead of `"::"` — blank drawings no longer collide with each other.
- BOQ + Ledger forms now reject negative qty/rate, empty material names, and (for Ledger) future-dated transactions. Outward/wastage transactions that exceed current stock balance are refused.
- BOQ + Ledger delete actions now require a `window.confirm` prompt with the line summary before destructive removal.
- `addDrawing` now requires both title AND type before creating a new revision.
- Smoke test bumped from 35 → 65+ checks; now also verifies that App.jsx imports PERMS from `./lib/permissions.js` and has no local `const PERMS` block.

### Removed
- `_incoming_sitetrack_pro/` legacy version snapshot (Supabase setup notes preserved into `docs/BACKEND_PLAN.md`).
- `sitetrack (1).jsx` (940-line orphan file never imported).
- Inlined PERMS object and helpers in `src/App.jsx` (moved to `src/lib/permissions.js`).

### Fixed
- Geolocation permission popup no longer fires on every photo upload; only when user opts in via the new toggle.
- BOQ/Ledger inputs cannot create unrealistic numbers (>1B) or zero/negative quantities.
- Ledger guards against issuing more material than currently in stock for that material.
- Drawing release no longer risks superseding multiple blank drawings under one collision key.
- Two React Hook violations fixed in `CreateView` and `VendorsView` (early-return before `useState`) — caught by new ESLint rule `react-hooks/rules-of-hooks`.

### Known Issues
- App.jsx remains ~2,200 lines. Refactor into `src/components/`, `src/views/`, `src/data/` queued in BACKLOG.
- CI workflow is in `docs/CI_WORKFLOW.yml`, not yet `.github/workflows/ci.yml` (PAT scope issue documented in `docs/CI_SETUP.md`).
- Supabase migrations have not been run on any real project. `BACKEND_PLAN.md` Phase B1 starts when Tech Lead provisions a dev project.
- No e2e/integration tests yet; Vitest only covers pure permission helpers.

## [0.0.1] — 2026-05-22 (initial repo commit)

Initial Site Tracker Pro snapshot with 20+ construction-domain modules, role-based access (Architect / PM / Contractor / Client), India-ready GST/TDS/EPF/ESI, PWA shell, localStorage demo persistence.
