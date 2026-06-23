# SiteTrack Pro — Work Board

**Last updated:** 2026-06-24

---

## Phase 2: DB-wire 6 v3 views ✅ **COMPLETE**

All 6 ported v3 standalone views are now wired to Supabase.

| View | Query module | Status | Key tables |
|---|---|---|---|
| HierarchyView | `hierarchyQueries.ts` | ✅ | `blocks`, `floors`, `units` |
| DelegationsView | `delegationQueries.ts` | ✅ | `delegations`, `org_members` |
| PlatformBrandingView | `brandingQueries.ts` | ✅ | `branding` (org + project) |
| PlatformAuditLogV2View | `auditLogQueries.ts` | ✅ | `audit_log_v2` |
| ForecastView | `forecastQueries.ts` | ✅ | `boq_items`, `ra_bills`, `inventory_transactions`, `site_updates`, `projects` |
| MaterialPricesView | — (external API) | ✅ | N/A — self-contained via `@/lib/materialPrices` |

## Phase 3: Port remaining roadmap views + cleanup ✅ **COMPLETE**

| View | New v3 file | Status |
|---|---|---|
| ComplianceView | `src/features/org/ComplianceView.tsx` | ✅ ported, route at `/compliance` |
| LabourKioskView | `src/features/kiosk/LabourKioskView.tsx` | ✅ already ported, cleaned up legacy |
| SiteWallKioskView | `src/features/kiosk/SiteWallKioskView.tsx` | ✅ already ported, cleaned up legacy |
| ARDrawingOverlayView | `src/features/kiosk/ARDrawingOverlayView.tsx` | ✅ already ported, cleaned up legacy |
| DailySnapshotView | `src/features/kiosk/DailySnapshotView.tsx` | ✅ already ported, cleaned up legacy |

**Cleanup:**
- Removed 5 case statements from App.jsx switch (compliance, kiosk-labour, kiosk-site, ar-overlay, snapshot)
- Removed 5 imports + 2 `useLS` state lines + 2 seed imports from App.jsx
- Removed unused utility imports (compliance, dailySnapshot libs) from App.jsx
- Removed 5 function exports + 2 helper components from `roadmap/index.jsx`
- `roadmap/index.jsx` now only exports `PlanGate` (still used by vendor-dashboard + detail tabs)
- Chunk savings: `roadmap` chunk 30.6 kB → 0.04 kB

**Build:** 1201 modules, 0 errors.

---

## Phase 3: Automated test expansion ✅ **COMPLETE**

| Area | Test file | Tests | Status |
|---|---|---|---|
| Router structure | `tests/app/router.test.ts` | 7 | ✅ |
| Branding queries | `tests/app/brandingQueries.test.ts` | 10 | ✅ |
| Delegation queries | `tests/app/delegationQueries.test.ts` | 6 | ✅ |
| React Query hooks | `tests/app/reactQueryHooks.test.tsx` | 3 | ✅ |
| Finance queries | `tests/app/financeQueries.test.ts` | 5 | ✅ |
| Platform admin queries | `tests/app/platformAdminQueries.test.ts` | 11 | ✅ |
| Org member queries | `tests/app/orgMemberQueries.test.ts` | 10 | ✅ |

Total: **96 test files, 1251 tests** — all passing (lint 0, tsc 0, build 1187 modules, smoke 284)

**P2 skipped** (Supabase local emulator requires CLI not available)

---

## Phase 4: CI / Monitoring ✅ **COMPLETE**

- **GitHub Actions CI** — `.github/workflows/ci.yml`: lint → typecheck → build → smoke → unit on push/PR
- **Bundle analysis** — `rollup-plugin-visualizer` in vite config, gated behind `ANALYZE=true`, `npm run analyze`
- **Vercel analytics** — `@vercel/analytics` `<Analytics />` component in `AppV3.tsx`
- **Sentry** — Already in place (lazy-loaded, DSN-gated)

---

## Completed work items

### 1. Route porting (Phase 1)
- Audited 45 legacy switch cases vs v3 routes — all ported
- Created 6 v3 TS views: `HierarchyView`, `MaterialPricesView`, `ForecastView`, `DelegationsView`, `PlatformBrandingView`, `PlatformAuditLogV2View`
- Added lazy imports + routes in `router.tsx` + nav items in `nav-config.ts`
- Removed 6 case statements, 6 imports, 6 `useLS` state lines, 6 seed imports, 6 roadmap imports from `App.jsx`
- Removed 6 function exports + stale imports from `roadmap/index.jsx`
- Removed 6 stale nav entries + `NAV_FEATURE_ID` entries from `shell/index.jsx`

### 2. DB wiring (Phase 2)
- **Hierarchy:** `listBlocks`, `listFloors`, `listUnits`, create/delete for Block/Floor/Unit
- **Delegations:** `listDelegations`, `listOrgMembers`, `createDelegation`, `revokeDelegation` with `"all"` → `"*"` scope mapping
- **Branding:** `getOrgBranding`, `getProjectBranding`, `listProjectBrandings`, upsert/delete with accent ↔ hex conversion
- **Audit Log:** `listAuditLog` (filters + pagination), `getAuditActors`, `getAuditStats`
- **Forecast:** `getProjectForecastDetail`, `getBoqForProject`, `getRaBillsForProject`, `getLedgerForProject`, `getUpdatesForProject` — real data fed to `forecastWithLlm`

---

## Dependencies / schema references

- `hierarchyQueries.ts` → tables `blocks`, `floors`, `units` (FK cascades for deletes)
- `delegationQueries.ts` → table `delegations` (migration 12), view `org_members`, join to `profiles`
- `brandingQueries.ts` → table `branding` (migration 23), partial unique indexes
- `auditLogQueries.ts` → table `audit_log_v2` (migration 03), RLS org-scoped reads
- `forecastQueries.ts` → tables `boq_items`, `ra_bills`, `inventory_transactions`, `site_updates`, `projects`
