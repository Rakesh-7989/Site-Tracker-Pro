# SiteTrack Pro Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning will start when the first paid pilot ships.

## [Unreleased]

### Added
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
