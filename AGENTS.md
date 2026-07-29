## Goal
Implement the structured UI update plan across the full application: auth gap closure, PlanGate integration, and query extraction.

## Constraints & Preferences
- All views in the authenticated route tree (ShellLayout → RequireSession) are already session-gated; content-level capability checks add defense-in-depth.
- PlanGate is orthogonal to RBAC: plan gating at the view level, capability gating at the action level.
- Tab visibility is gated by `visibleTabs()` in `DetailView.tsx` which checks both capabilities (`requires`/`requiresAny` from tabs-config.ts) and plans (`planCan`).
- Kiosk routes are inside ShellLayout so already behind `RequireSession`; no additional auth guard needed at route level.

## Done
- **Phase 1.1 — Admin auth gap closure (6 views):** PlatformBillingView (`platform:billing:manage`), PlatformAuditView (`platform:audit:read:cross-org`), PlatformUsageView (`platform:orgs:manage`), PlatformSettingsView (`platform:settings:manage`), PlatformBrandingView (`platform:settings:manage`), PlatformSupportView (`platform:orgs:manage`) — all with `useCan` + `<AccessDenied>`.
- **Phase 1.2:** PlatformAuditLogV2View — added `useCan("platform:audit:read:cross-org")` + `<AccessDenied>`.
- **Phase 1.3 — Project tab auth checks:** MessagesTab — added `useCan("message:send", ...)` to gate the send button. Other 27 tabs already have `useCan` for their action capabilities.
- **Phase 1.4:** DelegationsView — added `useCan("org:members:manage")` + `<AccessDenied>`.
- **Phase 2 discovery:** All 28 project tabs are in `DetailView.tsx`'s `REAL_TABS` set and individually rendered. `TabPlaceholder` fallback is dead code. Tab-building effort is already complete.
- **Phase 3 — PlanGate (7 views):** LabourKioskView (`kiosks`), SiteWallKioskView (`kiosks`), DailySnapshotView (`kiosks`), ARDrawingOverlayView (`ar_overlay`), ForecastView (`ai_forecast`), HierarchyView (`hierarchy`), MaterialPricesView (`material_aggregator`).
- **Phase 4 skipped:** React Query adoption — unnecessary; manual `useState`+`useEffect`+`getClient()` pattern works, has complete state coverage, and is uniform across the codebase.
- **Phase 5 — Query extraction (7 query files, 7 views updated):**
  - `src/app/platformUsageQueries.ts`: `getUsageStats()` — updated PlatformUsageView
  - `src/app/platformBillingQueries.ts`: `listOrgBillingRows()` — updated PlatformBillingView
  - `src/app/platformAuditQueries.ts`: `listAuditEvents()` — updated PlatformAuditView
  - `src/app/pmQueries.ts`: `listPMProjects()`, `listPMNotifications()` — updated PMView
  - `src/app/clientPortalQueries.ts`: `listClientProjects()`, `listClientNotifications()` — updated ClientPortalView
  - `src/app/vendorPortalQueries.ts`: `listVendorPOs()`, `listMaterialPrices()` — updated VendorPortalView
  - `src/app/featureFlagQueries.ts`: `getOrgIdFromMember()`, `listFeatureFlags()`, `upsertFeatureFlag()` — updated OrgFeaturesView
  - `src/app/platformSettingsQueries.ts`: `listOpsToggles()`, `upsertOpsToggle()` — updated PlatformSettingsView
  - `src/app/platformSupportQueries.ts`: `listSupportTickets()`, `listOrgsBrief()`, `updateSupportTicket()` — updated PlatformSupportView
  - `src/app/onboardingQueries.ts`: `getMyOrg()`, `updateOrg()`, `insertOrgMembers()`, `createProject()`, `disableFeatureFlags()`, `completeOnboarding()` — updated OnboardingView
- **TypeScript check: 0 errors** after all changes.

## Key Decisions
- Skipped React Query adoption (Phase 4) — manual pattern is uniform and fully functional across 40+ query files.
- Skipped `<RequireSession>` on kiosk views — they are already behind ShellLayout's `RequireSession`.
- `MapTab` and `GanttTab` left without content-level capability checks — they are read-only views whose tab visibility is already gated by `DetailView`'s `visibleTabs()`.
- MaterialPricesView inline `canUseFeature()` fallback removed after PlanGate wrapper was added (PlanGate now handles plan gating at the top level).

## Relevant Files
- `src/features/admin/*.tsx`: 7 admin views — capability-gated (Phase 1) + 3 with extracted queries (Phase 5).
- `src/features/kiosk/*.tsx`: 4 kiosk views — PlanGate-wrapped (Phase 3).
- `src/features/org/{DelegationsView,ForecastView,HierarchyView,MaterialPricesView}.tsx`: PlanGate and/or capability gating added.
- `src/features/project/tabs/MessagesTab.tsx`: `useCan("message:send")` added.
- `src/app/*Queries.ts`: 10 query files created (Phase 5).
- `src/auth/PlanGate.tsx`: `<PlanGate feature="...">` API.
- `src/auth/capabilities.ts`: all capabilities.
- `src/auth/planCaps.ts`: all 22 `PlanFeature` values.
- `src/features/project/tabs-config.ts`: tab catalog.

---

## JS→TS Migration (post-redesign cleanup)

**✅ COMPLETE** — All 38 `.js` files in `src/lib/` + 2 `.js` files in `src/data/` have been migrated to `.ts`. Zero `.js`/`.jsx` files remain under `src/`.

## Auth Login Fix (Session 2026-07-28)

### Problem
Superadmin sign-in at `/staff/login` failed with `?error=session` after DB cleanup deleted auth users and profiles.

### Root Cause
1. `org_members.is_admin` column selected by `fetchAuthSession.ts` didn't exist in the live DB → `db-error`
2. After fixing the column, profile was missing at the auth user's UUID → `no-profile`

### Fixes Applied
| Change | File / Migration |
|--------|-----------------|
| Added `is_admin` column to `org_members` + `ensure_my_profile()` RPC | `migration 127` |
| Removed `is_admin` from SELECT, derive from `role` field | `fetchAuthSession.ts`, `delegationQueries.ts`, `orgMemberQueries.ts` |
| Auto-create missing profile on sign-in | `fetchAuthSession.ts` — calls `ensure_my_profile()` RPC on no-profile |
| Include error detail in `?error=session` redirect | `ShellLayout.tsx`, `LoginScreenV3.tsx` |
| `onAuthStateChange` skips hydrate on SIGNED_IN to avoid race | `useAuthUser.ts` |
| Lane mismatch redirects (instead of sign-out) in `afterAuth()` | `LoginScreenV3.tsx` |

### Relevant Files
- `src/auth/fetchAuthSession.ts`
- `src/auth/useAuthUser.ts`
- `src/features/auth/LoginScreenV3.tsx`
- `src/features/shell/ShellLayout.tsx`
- `src/app/delegationQueries.ts`
- `src/app/orgMemberQueries.ts`
- `scripts/supabase/127_auto_create_missing_profile.sql`

---

## RBAC Deep-Dive + Fixes (2026-07-28)

- **Analysis**: Full per-role capability/nav/dashboard/tab/plan matrix documented in `RBAC_DEEP_DIVE.md`; 7 gaps identified
- **Gap 1**: sub_contractor — added `attendance:view` to identity + project-tier caps
- **Gap 2**: nav — added RA Bills (`/rabills`) item gated by `rabill:create` under Procurement group
- **Gap 3**: prospector — `defaultProjectTierFor()` returns `"pm"` instead of null
- **Gap 4**: duplicate icons — feature-flags→`flag`, branding→`image`, settings stays `sliders`
- **Gap 5**: handover — added `handover:generate` to PM + project_admin identity caps
- **Gap 6**: PM digest — added `digest:subscribe` + `digest:receive` to PM identity caps
- **Gap 7**: site_inspector Compliance nav — already works, no change needed
- **All 6 fixes**: TypeScript 0 errors, 94 files / 1201 tests pass

## Phase 4 — Component Library Consistency (Complete)

**All 19 `src/components/ui/` files** — zero palette classes remain:
- **Batch A** — `atoms.tsx`: BTN_VARIANT, Card, BADGE_TONE (5), ALERT (6), AV_BG (15), ProgressBar BAR (5), StatCard STAT (5), Tile (5) — all `cream-*`/`ink-*`/`safety-*`/`rose-*`/`emerald-*`/`amber-*`/`blue-*`/`violet-*`/`orange-*` → semantic utilities
- **Batch B** — `status.ts` (8 entries) + `role-meta.ts` (22 entries): migrated to `bg-success-tint`, `bg-info-tint`, `bg-accent-tint`, `bg-elevated`, `text-success`, etc. Added CSS vars for 11 missing color families
- **Batch C–E** — tabs, calendar, data table, forms, checkbox, switch, modal, dialog, etc.

### Semantic CSS utilities (from index.css)
| Group | Classes |
|-------|---------|
| Surface | `.bg-panel`, `.bg-elevated`, `.bg-card`, `.bg-bg-primary`, `.bg-bg-secondary`, `.bg-ink` |
| Text | `.text-fg-primary`, `.text-fg-secondary`, `.text-fg-tertiary`, `.text-cream` |
| Border | `.border-default`, `.border-stronger`, `.border-success`, `.border-warning` |
| Accent (orange) | `.bg-accent`, `.bg-accent-2`, `.bg-accent-tint`, `.text-accent`, `.text-accent-2`, `.text-accent-light` |
| Violet | `.bg-violet-tint`, `.text-violet` |
| Status | `.bg-success-tint`, `.text-success`, `.bg-warning-tint`, `.text-warning`, `.bg-error-tint`, `.text-error`, `.bg-info-tint`, `.text-info` |
| Role chips (11 families) | `.bg-{teal,cyan,rose,fuchsia,purple,yellow,blue,emerald,indigo,ink}-tint`, `.text-{teal,cyan,rose,fuchsia,purple,yellow}` |

## Phase 5 — Feature & Component Directory Migration (Complete)

All custom palette classes (`ink-*`, `cream-*`, `safety-*`, `amber-*`, `emerald-*`, `red-*`, `rose-*`, `blue-*`, `violet-*`, `stone-*`, `orange-*`) replaced with semantic `--st-*` CSS utilities across ~140 files:

| Batch | Scope | Files | Key patterns replaced |
|-------|-------|-------|-----------------------|
| A | `admin/` | 18 | `text-ink-*`, `bg-cream-*`, `border-safety-*`, etc. |
| B | `org/` | 34 | Same + `text-amber-*`, `bg-emerald-*`, `text-red-*` |
| C1 | `project/`, `share/`, `dashboards/`, `kiosk/`, `account/`, `dpr/` | 48 | + dark-theme kiosk colors (`bg-ink-700`, `border-amber-600`, `text-cream`) |
| C2 | `auth/`, `shell/`, `handover/`, `marketing/` | 22 | + `text-violet-*`, `bg-orange-*`, hover variants |
| D | `errorBoundary.tsx`, `UpiQr.tsx`, `atoms.tsx`, `PlanGate.tsx`, project tabs | 10 | Final cleanup |

**Verification** (all pass):
- `Select-String -Pattern "ink-|cream-|safety-|amber-|emerald-|rose-|violet-|stone-" src/**/*.{ts,tsx}` → **0 matches** (intentional `bg-white` in toggle thumbs & tab badge overlay remain — 3 sites)
- `npx tsc --noEmit` → **0 errors**

## Phase 6 — Next (planned)
- Mobile/responsive audit — CalendarGrid mobile layout, Board stacked column, Tabs overflow indicator, top-20 file content overflow, optional `xs:` breakpoint, landing nav
