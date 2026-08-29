# SiteTrack Pro — Rewrite Build Plan

Based on deep R&D analysis (2026-06-23). Covers 5 focus areas across 4 phases.

---

## Execution Rules

1. **Test after every build step** — run `npm test` (lint + typecheck + build + smoke + unit)
2. **No breaking changes** — each phase must be deployable independently
3. **Legacy + v3 coexist** during porting; delete legacy only at the end
4. **Commit each step** with a clear message

---

## Phase 1: Data Layer Foundation

Goal: Replace manual `useState`+`useEffect` data fetching with proper caching/dedup.

### Step 1.1 — Install React Query

- `npm install @tanstack/react-query`
- Create `src/app/QueryProvider.tsx` wrapping `<QueryClientProvider>`
- Integrate into `AppV3.tsx` (inside `AuthProvider`)

### Step 1.2 — Create base query hooks

- `useSupabaseQuery(queryKey, queryFn, options?)` — wraps `useQuery` with:
  - Automatic Supabase client resolution
  - Error handling via discriminated union return
- `useSupabaseMutation(mutationFn, options?)` — wraps `useMutation`

### Step 1.3 — Migrate 3 most-used query files

Pick high-traffic queries first:
- `src/app/queries/queries.ts` (projects + members)
- `src/app/queries/milestoneQueries.ts`
- `src/app/queries/taskQueries.ts`

Convert to `useQuery` hooks with proper cache keys.

### Step 1.4 — Add data test

- Write integration test verifying cache hit reduces network calls
- Verify stale-while-revalidate behavior

**Verification:** `npm test` passes. No visible change to users.

---

## Phase 2: Backend Hardening

Goal: Fix DB logic bugs, organize migrations, audit RLS.

### Step 2.1 — Audit RLS policies

- Read all 10+ migration files with RLS (`02_rls.sql` through `114_*.sql`)
- Compare frontend capability matrix (`permissions-matrix.ts`) with SQL RLS
- Document any gaps or contradictions
- Fix high-severity bugs

### Step 2.2 — Organize migrations

- Create `supabase/migrations/` directory
- Renumber/consolidate 100+ SQL files into logical migrations
- Add `supabase/config.toml` with proper project config

### Step 2.3 — Audit DB functions + triggers

- Check `SECURITY DEFINER` functions for SQL injection risks
- Verify trigger logic (signup, quotas, inspector immutability)
- Add index review for query performance

### Step 2.4 — Add backend tests

- Write SQL-level tests for critical RLS policies
- Test edge cases: cross-org access, removed members, soft-deleted projects

**Verification:** `npm test` passes + manual regression on key flows.

---

## Phase 3: Feature Porting to v3 Shell

Goal: Port all legacy features from `App.jsx` to the v3 TypeScript shell.

| Priority | Feature | Legacy File | v3 Target | Effort |
|----------|---------|-------------|-----------|--------|
| P0 | Org Admin (members, billing, roles, templates, approvals, notifications, integrations) | `App.jsx` → `OrgAdminView` | Already has routes, verify completeness | 1-2 days |
| P0 | Project detail tabs (all 28) | `DetailView` | Already has routes, verify completeness | 1-2 days |
| P1 | Finance (expenses, invoices, RA bills, POs, budget, ledger) | `App.jsx` switches | Has v3 views? Check and port | 2-3 days |
| P1 | Field ops (safety, inspections, punchlist, attendance, labour) | `App.jsx` switches | Has v3 views? | 2-3 days |
| P2 | Compliance (RERA, GST, EPFO) | `App.jsx` switches | No v3 view yet | 1 day |
| P2 | Vendor portal | `App.jsx` switch | `VendorsView.tsx` exists | 1 day |
| P2 | Messages & notifications | `App.jsx` | `NotificationsView.tsx` exists | 1 day |
| P3 | Drawings & BOQ | `App.jsx` | Project tab `DrawingsTab`, `BoqTab` exist | 1 day |
| P3 | RFI, Change Orders, Handover | `App.jsx` | Project tabs exist | 1 day |
| P3 | Gantt, Analytics, Calendar, Search | `App.jsx` | Views exist? | 2 days |

### Step 3.1 — Audit v3 vs legacy feature completeness

- Map every route/view in `App.jsx` to its v3 equivalent
- Identify gaps
- Port missing views one at a time

### Step 3.2 — Port testing gap

- Add tests for newly ported views
- Verify role-based access on new pages

### Step 3.n — Repeat per feature

Each feature port follows the same pattern:
1. Create/verify v3 route exists
2. Create `FeatureView.tsx` with proper auth/capability gating
3. Add lazy import in `router.tsx`
4. Verify sidebar nav shows for correct roles
5. Run tests

**Verification:** `npm test` passes. Feature works in v3 shell.

---

## Phase 4: Cleanup & Consolidation

Goal: Delete legacy code, finalize.

### Step 4.1 — Remove legacy shell

- After ALL features are ported:
- Delete `src/main.tsx`
- Delete `src/auth/permissions-matrix.ts`
- Remove `?shell=legacy` fallback from `main.jsx`
- Remove `useLS` hooks

### Step 4.2 — Final test pass

- Run full test suite
- Run E2E tests
- Verify all 22 roles see correct nav + have correct access

### Step 4.3 — Documentation update

- Update `ARCHITECTURE.md` to reflect single-shell v3
- Remove legacy references

---

## How We'll Execute

Each session = 1 step. Pattern:

1. Pick next step from plan
2. Implement changes
3. Run `npm test` (lint → typecheck → build → smoke → unit)
4. Fix any failures
5. Report summary

---

## Phase 2.1 Audit Findings

### RLS Gaps Found (8 issues)

| # | Severity | Issue | Fixed in |
|---|----------|-------|----------|
| 1 | **High** | `ops_toggles` write policy lets ANY org member write feature flags | `116_rls_policy_fixes.sql` |
| 2 | Medium | `write_milestones` missing `project_admin` (has milestone:add/edit caps) | `116_rls_policy_fixes.sql` |
| 3 | Medium | `write_ra_bills` missing `pm` + `project_admin` (rabill:create caps) | `116_rls_policy_fixes.sql` |
| 4 | Medium | `write_pos` missing `project_admin` (po:approve cap) | `116_rls_policy_fixes.sql` |
| 5 | Medium | `write_invoices` missing `project_admin` (invoice:create cap) | `116_rls_policy_fixes.sql` |
| 6 | Medium | `create_project_architect` / `update_project_architect` missing `pm` (project:create cap) | `116_rls_policy_fixes.sql` |
| 7 | Low | RLS uses identity roles (`profiles.role`) not org-tier (`org_members.role`) — 3-tier architecture not reflected in SQL | Documented; needs larger refactor |
| 8 | Low | Custom roles (`org_custom_roles`) have zero RLS integration; only applied client-side | Requires new RLS helper functions |

## Current Status

| Phase | Step | Status |
|-------|------|--------|
| 1 | 1.1 Install React Query | done |
| 1 | 1.2 Create base hooks | done |
| 1 | 1.3 Migrate queries | done |
| 1 | 1.4 Add data tests | done |
| 2 | 2.1 RLS audit + high-severity fixes | done |
| 2 | 2.2 Enhanced supabase/config.toml | done |
| 2 | 2.3 DB function audit + search_path hardening | done |
| 2 | 2.4 Backend SQL tests (requires DB) | done |
| 3 | 3.1-3.n Port features | done (all v3 views ported, App.jsx stripped to single default case) |
| 4 | 4.1-4.3 Cleanup | done (P4: CI + bundle analysis + Vercel analytics) |
