# SiteTrack Pro — E2E Real-Time Testing: Agentic Looping Methodology

## The Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                    MASTER LOOP (per Phase)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                INNER LOOP (per Sub-Task)                   │  │
│  │                                                           │  │
│  │  1. DEEP DIVE ──► 2. PLAN ──► 3. BUILD ──► 4. CHECK      │  │
│  │        ▲                                      │           │  │
│  │        └────────── FAIL ──────────┘           │           │  │
│  │                                               ▼           │  │
│  │                                        PASS → NEXT SUB    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                                       │
│                         ▼                                       │
│              All sub-tasks done? ──NO──► Next sub-task           │
│                         │                                       │
│                        YES                                      │
│                         ▼                                       │
│              Phase re-check ──► Next Phase ──► ... ──► DONE     │
└─────────────────────────────────────────────────────────────────┘
```

**Rules:**
1. **ONE sub-task at a time** — never parallelize across phases, only within a sub-task
2. **Plan before code** — each sub-task gets a written plan before any file changes
3. **Verify immediately** — after building, run relevant checks before moving on
4. **Fail fast** — if a sub-task fails, fix it before proceeding (don't skip)
5. **Document decisions** — every significant decision is captured in the plan

## Phase Execution Order

```
Phase 0 (Infra)
  │
  ▼
Phase 1 (Auth) ──► Phase 2 (Project CRUD) ──► Phase 3 (DPR)
                                                      │
                                                      ▼
Phase 4 (Realtime) ◄── Phase 5 (Kiosk/Mobile) ◄── Phase 6 (Admin)
                                                      │
                                                      ▼
Phase 7 (PlanGate) ──► Phase 8 (i18n/a11y) ──► Phase 9 (Perf)
                                                      │
                                                      ▼
                                           GLOBAL RE-CHECK
                                                      │
                                                      ▼
                                           TRIGGER CI (manual)
                                                      │
                                                      ▼
                                           PUSH TO LIVE
```

## Phase 0: Infrastructure Setup

### Sub-Task 0.1: Playwright Browser Matrix
**Deep Dive**: Current config (`playwright.config.js` and `playwright.config.ts`) uses Chromium only. Need to add Firefox, WebKit, and mobile emulation.

**Plan**: 
- Expand `playwright.config.ts` projects to include:
  - `chromium` (Desktop Chrome)
  - `firefox` (Desktop Firefox)
  - `webkit` (Desktop Safari)
  - `Mobile Chrome` (Pixel 7 emulation)
  - `Mobile Safari` (iPhone 14 emulation)
- Update `projects` array in Playwright config

**Check**: `npx playwright test --list` shows all 5 projects

### Sub-Task 0.2: CI E2E Workflow
**Deep Dive**: Existing `.github/workflows/ci.yml` does not run E2E. Need manual-trigger workflow.

**Plan**: Create `.github/workflows/e2e-manual.yml` with:
- `workflow_dispatch` trigger
- Checkout → Setup Node → npm ci → Build → `npx playwright install --with-deps` → `npm run test:e2e`
- Upload Playwright report as artifact

### Sub-Task 0.3: Test Database Seed Script
**Deep Dive**: E2E tests need realistic data. Current E2E uses localStorage demo mode only.

**Plan**: Create `scripts/seed-e2e.ts` that connects to Supabase preview branch and inserts:
- 3 organizations
- 7 test users (all roles)
- 5 projects (with 28+ tab entities)
- 50+ BOQ items, 30 labour entries, 20 issues, 10 milestones
- Realistic DPR data

### Sub-Task 0.4: Test Account Creation Script
**Deep Dive**: Need automated account creation for 7 roles.

**Plan**: Create `scripts/create-test-accounts.ts` using Supabase Admin API (service_role key) to create users with known credentials.

---

## Phase 1: Auth & Session

### Sub-Task 1.1: Password Login
**Deep Dive**: LoginScreenV3 uses `signInWithPassword()`. Need to test valid login, invalid password, and edge cases.

**Plan**: Write `tests/e2e/auth-password.spec.ts` with:
- Valid email/password → redirect to `/dashboard`
- Invalid password → error message visible
- Empty fields → validation errors
- Locked account → appropriate error

### Sub-Task 1.2-1.9: Remaining Auth specs
Follow same pattern for magic link, OTP, MFA, invites, password reset, session expiry, org switcher.

---

## Phase 2-9: Same pattern

Each sub-task follows: Deep Dive → Plan → Build → Check → Next

---

## Global Re-Check (after all phases)
- Run all unit tests: `npm run test:unit`
- Run all E2E tests: `npm run test:e2e`
- TypeScript check: `npm run typecheck`
- Build: `npm run build`
- Smoke: `npm run smoke`
- Fix any regressions

## CI Trigger
- Run the manual E2E workflow
- Verify all reports pass
- Fix any failures

## Push to Live
- Commit all changes
- Push to `main`
- Verify Vercel deployment succeeds
- Verify production smoke test passes
