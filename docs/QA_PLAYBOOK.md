# QA / Testing Playbook — SiteTrack Pro

The single source of truth for how to test every feature, workflow, and
regression in this project. Kept in sync with the work-state in `AGENTS.md`.

## 1. Test suites (verified 2026-08-10)

| # | Suite | Command | Proves | Scale |
|---|-------|---------|--------|-------|
| T0 | Lint | `npm run lint` | style / unused / react rules | ~200 max-warnings |
| T0 | Typecheck | `npm run typecheck` | TS correctness (whole app) | `tsc --noEmit` |
| T0 | Build | `npm run build` | production bundle compiles | vite |
| T1 | Smoke | `npm run smoke` | app markers + JS↔SQL parity + stub-view parity + doc freeze | 304 checks |
| T2 | Unit | `npm run test:unit` | pure logic, mappers, RBAC matrix, nav/tabs/plans/i18n | 103 files / ~1,800 tests |
| T2 | Coverage | `npm run test:unit:coverage` | logic-layer coverage w/ baseline thresholds (see §5) | 53.65% lines baseline |
| T3 | e2e-mock | `npm run test:e2e:mock` | real router + shell, mocked Supabase, per-role access | 11 tests (chromium, CI-safe) |
| T4 | e2e-live | `npm run test:e2e` | real flows on **prod**, 5 browsers | needs live creds |
| T5 | EF harness | `npm run test:ef` | Supabase Edge Functions | — |
| T5 | RLS self-svc | `npm run test:rls` | row-level security posture | — |
| T6 | DB apply | `npm run db:apply` | idempotent migration apply + NOTICE verify | 134 applied live |
| T6 | Role probe | `npm run qa:roles` | role-access probe | — |
| T7 | Manual | G-Arch seeded 22 roles + demo project | real-user regression | creds in gitignored `GARCHITECTS_CREDENTIALS.md` |

**Full gate in one command:** `npm test` (= lint + typecheck + build + smoke + unit).

CI (`ci.yml`) runs lint → typecheck → build → smoke → unit, plus a parallel
`e2e-mock` job (chromium role-access) and a `coverage` job (thresholds), on
push/PR to `main`/`prod`. `nightly.yml` schedules a full regression + live
uptime probe daily at 02:30 UTC. Deploy is a separate `deploy.yml` on `prod`
push → Vercel.

## 2. The 5-tier recipe for ANY new feature/workflow

1. **T0 Static** — `npm run lint` + `npm run typecheck` (must be clean first).
2. **T2 Unit** — pure helpers/mappers/labels → `tests/app/*.test.ts`;
   RBAC/nav/tabs/plans → `tests/auth/*`, `tests/app/navConfig.test.ts`,
   `tests/project/tabsConfig.test.ts`.
3. **T1 Smoke** — add markers to `scripts/smoke.mjs` (each phase adds ~2-10).
4. **T3 e2e-mock** — if the change affects nav/access, extend
   `e2e-mock/role-access.spec.ts` with the role + expectation.
5. **T4/T7 Live** — `test:e2e` on prod + manual sign-in per affected G-Arch role.

## 3. Per-feature test map

### 3.1 Auth & session
- **Unit**: `tests/auth/` (fetchAuthSession, RoleResolver, login routing, permissionsMatrix 93, planCaps, version).
- **e2e-mock**: superadmin / pm / client blocks.
- **Manual**: login each G-Arch role → correct landing (RoleDashboard). Multi-org switch. Impersonation (superadmin). Invite → accept flow (v6 1.1).

### 3.2 RBAC + nav + plan/module gates
- **Unit**: `navConfig.test.ts` (28), `tabsConfig.test.ts`, `permissionsMatrix.test.ts`, `plugins/*.test.ts`, `modules/registry.test.ts`.
- **e2e-mock**: 11 role-access tests (AccessDenied heading is exactly "Access Restricted").
- **Manual**: per role — sidebar shows expected links only; forbidden routes → AccessDenied / PlanGate / ModuleGuard.

### 3.3 CRM pipeline (Phase A + H1/H2)
- **Unit**: `tests/app/crmQueries.test.ts` (rollup, LEAD_STAGE_NEXT, byOwner, acceptQuotationAsAgreement idempotency).
- **Manual**: lead → meeting → quotation → accept → agreement; owner reassign; funnel cards; won → project handoff.

### 3.4 Consultancy (C1–C3: time/phases/deliverables/reviews/billing/cron)
- **Unit**: `c1Queries`, `c2Billing`, `c3Utilization`, `c3DeliverableStorage`, `c3InvoiceLines`, `c3RetainerCron`, `cAudit`.
- **Manual**: log time → approve → generate hourly/retainer invoice → verify line items + `RTR-YYYYMM` no → cron next-day at 02:05 UTC.

### 3.5 Architecture/Interior registers (D)
- **Unit**: `d1DrawingFiles`, `d2DrawingDiff`, `d3Ffe`, `d4Statutory`, `d5Procurement`, `d6CrossLinks`.
- **Manual**: upload drawing → compare revisions → FFE schedule → statutory NOC (expiring → `/calendar` NOC row) → quote compare → Raise PO.

### 3.6 Procurement → inventory (E, E2, E3, E4, G1)
- **Unit**: `poReceipts`, `crossPoQueries`, `g1MaterialRequests`, `quoteScoring`, `e3FfeRollup`, `e4DownloadAudit`, `monthlyStatement`.
- **Manual**: material request → approve → PO → receipt (GRN auto-posts inventory, request → received) → FF&E rollup → Download Audit → Monthly Statement PDF.

### 3.7 DPR flow (Sprint 2 + G4)
- **Unit**: `tests/dpr/` (digestPreview, efInternals, dprViews, offlineQueueBanner) + `g4DprPdf`.
- **Manual**: compose → voice (mock adapter) → geotag photo → submit → offline queue (drop network) → history → detail → **Download PDF** → WhatsApp share.

### 3.8 Finance (v6 1.3, C2, E5)
- **Unit**: `crossInvoiceQueries`, `financeQueries` mappers, `monthlyStatementPdf`.
- **Manual**: invoice payment status (Paid/Partial/Pending/Overdue) → `/invoices` rollup → monthly statement PDF.

### 3.9 Platform admin + branding + i18n
- **Unit**: `fBranding`, i18n parity test (en/hi/te), marketing tests.
- **Manual**: superadmin `/admin/*` gates; org branding accent swap; switch hi/te on major screens.

### 3.10 Mobile/responsive (Phase 6)
- **e2e-live**: Mobile Chrome + Mobile Safari projects.
- **Manual**: sidebar drawer, calendar stacked view, board accordion, kiosk forms at 360px.

### 3.11 DB / RLS / EF
- `npm run db:apply` after any migration; `test:rls`; `test:ef`; `check:supabase` / `verify:keys` before deploys.

## 4. Regression cadence

### Per change (developer)
1. Targeted unit: `npx vitest run tests/<area>`
2. Full gate: `npm test`
3. If nav/access changed: `npm run test:e2e:mock`

### Per phase ship (SDLC "Verify")
1. `npm test` (full gate)
2. `npm run test:e2e:mock`
3. `npm run db:apply` if migrations changed (NOTICE-verified live)
4. Push `prod` → Vercel auto-deploy → `Invoke-WebRequest` → 200

### Automated (CI / scheduled — no human needed)
- **Push/PR to `main`/`prod`** → `ci.yml` 3 parallel jobs: `test` (lint+typecheck+build+smoke+unit), `e2e-mock` (chromium role-access), `coverage` (thresholds).
- **Daily 02:30 UTC** → `nightly.yml`: lint → typecheck → build → smoke → unit → e2e-mock → **live uptime probe** (frontend 200 + Supabase health). Failures = red check on `prod`.

### Weekly regression (manual)
1. `npm run test:e2e` against prod (5 browsers, live creds)
2. G-Arch 22-role manual sweep — see `docs/MANUAL_QA_GARCH.md`
3. Review smoke deltas + coverage trends (raise thresholds in `vitest.config.js`)

## 5. Test infrastructure — gaps & improvement log

| Date | Gap | Fix | Status |
|------|-----|-----|--------|
| 2026-08-10 | `ci.yml` never ran the CI-runnable **e2e-mock** suite | added parallel `e2e-mock` job (playwright chromium + `test:e2e:mock`) | ✅ implemented |
| 2026-08-10 | No **coverage** reporting/thresholds | `@vitest/coverage-v8` + `test:unit:coverage` + `coverage` CI job; thresholds = measured baseline (lines 50 / stmts 48 / funcs 50 / branches 38 — baseline 53.65/50.68/52.41/41.07) | ✅ implemented |
| 2026-08-10 | No **scheduled** regression run against prod | `nightly.yml` cron 02:30 UTC: lint → typecheck → build → smoke → unit → e2e-mock → live uptime probe | ✅ implemented |
| 2026-08-10 | Baseline coverage is low in the `src/lib`/`plugins` render layers | raise thresholds after each phase (trend-up policy) | 🔭 future |

## 6. Adding a test for a new feature (checklist)

- [ ] Pure logic → `tests/app/<feature>.test.ts` (mirrors existing query-file test style)
- [ ] RBAC change → `tests/auth/permissionsMatrix.test.ts` (incl. no-dead-caps) + `navConfig.test.ts`
- [ ] Tab/nav change → `tabsConfig.test.ts` / `navConfig.test.ts` + module/segment gates
- [ ] New query file → marker in `scripts/smoke.mjs`
- [ ] New migration → `scripts/supabase/NNN_*.sql` + `npm run db:apply` verify
- [ ] New route/role surface → `e2e-mock/role-access.spec.ts`
- [ ] i18n keys → parity test (en/hi/te)
- [ ] Update this playbook + `AGENTS.md` work-state
