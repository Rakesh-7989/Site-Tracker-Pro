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
