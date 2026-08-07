## Goal
Implement the structured UI update plan across the full application: auth gap closure, PlanGate integration, and query extraction.

## Constraints & Preferences
- All views in the authenticated route tree (ShellLayout â†’ RequireSession) are already session-gated; content-level capability checks add defense-in-depth.
- PlanGate is orthogonal to RBAC: plan gating at the view level, capability gating at the action level.
- Tab visibility is gated by `visibleTabs()` in `DetailView.tsx` which checks both capabilities (`requires`/`requiresAny` from tabs-config.ts) and plans (`planCan`).
- Kiosk routes are inside ShellLayout so already behind `RequireSession`; no additional auth guard needed at route level.

## Done
- **Phase 1.1 â€” Admin auth gap closure (6 views):** PlatformBillingView (`platform:billing:manage`), PlatformAuditView (`platform:audit:read:cross-org`), PlatformUsageView (`platform:orgs:manage`), PlatformSettingsView (`platform:settings:manage`), PlatformBrandingView (`platform:settings:manage`), PlatformSupportView (`platform:orgs:manage`) â€” all with `useCan` + `<AccessDenied>`.
- **Phase 1.2:** PlatformAuditLogV2View â€” added `useCan("platform:audit:read:cross-org")` + `<AccessDenied>`.
- **Phase 1.3 â€” Project tab auth checks:** MessagesTab â€” added `useCan("message:send", ...)` to gate the send button. Other 27 tabs already have `useCan` for their action capabilities.
- **Phase 1.4:** DelegationsView â€” added `useCan("org:members:manage")` + `<AccessDenied>`.
- **Phase 2 discovery:** All 28 project tabs are in `DetailView.tsx`'s `REAL_TABS` set and individually rendered. `TabPlaceholder` fallback is dead code. Tab-building effort is already complete.
- **Phase 3 â€” PlanGate (7 views):** LabourKioskView (`kiosks`), SiteWallKioskView (`kiosks`), DailySnapshotView (`kiosks`), ARDrawingOverlayView (`ar_overlay`), ForecastView (`ai_forecast`), HierarchyView (`hierarchy`), MaterialPricesView (`material_aggregator`).
- **Phase 4 skipped:** React Query adoption â€” unnecessary; manual `useState`+`useEffect`+`getClient()` pattern works, has complete state coverage, and is uniform across the codebase.
- **Phase 5 â€” Query extraction (7 query files, 7 views updated):**
  - `src/app/platformUsageQueries.ts`: `getUsageStats()` â€” updated PlatformUsageView
  - `src/app/platformBillingQueries.ts`: `listOrgBillingRows()` â€” updated PlatformBillingView
  - `src/app/platformAuditQueries.ts`: `listAuditEvents()` â€” updated PlatformAuditView
  - `src/app/pmQueries.ts`: `listPMProjects()`, `listPMNotifications()` â€” updated PMView
  - `src/app/clientPortalQueries.ts`: `listClientProjects()`, `listClientNotifications()` â€” updated ClientPortalView
  - `src/app/vendorPortalQueries.ts`: `listVendorPOs()`, `listMaterialPrices()` â€” updated VendorPortalView
  - `src/app/featureFlagQueries.ts`: `getOrgIdFromMember()`, `listFeatureFlags()`, `upsertFeatureFlag()` â€” updated OrgFeaturesView
  - `src/app/platformSettingsQueries.ts`: `listOpsToggles()`, `upsertOpsToggle()` â€” updated PlatformSettingsView
  - `src/app/platformSupportQueries.ts`: `listSupportTickets()`, `listOrgsBrief()`, `updateSupportTicket()` â€” updated PlatformSupportView
  - `src/app/onboardingQueries.ts`: `getMyOrg()`, `updateOrg()`, `insertOrgMembers()`, `createProject()`, `disableFeatureFlags()`, `completeOnboarding()` â€” updated OnboardingView
- **TypeScript check: 0 errors** after all changes.

## Key Decisions
- Skipped React Query adoption (Phase 4) â€” manual pattern is uniform and fully functional across 40+ query files.
- Skipped `<RequireSession>` on kiosk views â€” they are already behind ShellLayout's `RequireSession`.
- `MapTab` and `GanttTab` left without content-level capability checks â€” they are read-only views whose tab visibility is already gated by `DetailView`'s `visibleTabs()`.
- MaterialPricesView inline `canUseFeature()` fallback removed after PlanGate wrapper was added (PlanGate now handles plan gating at the top level).

## Relevant Files
- `src/features/admin/*.tsx`: 7 admin views â€” capability-gated (Phase 1) + 3 with extracted queries (Phase 5).
- `src/features/kiosk/*.tsx`: 4 kiosk views â€” PlanGate-wrapped (Phase 3).
- `src/features/org/{DelegationsView,ForecastView,HierarchyView,MaterialPricesView}.tsx`: PlanGate and/or capability gating added.
- `src/features/project/tabs/MessagesTab.tsx`: `useCan("message:send")` added.
- `src/app/*Queries.ts`: 10 query files created (Phase 5).
- `src/auth/PlanGate.tsx`: `<PlanGate feature="...">` API.
- `src/auth/capabilities.ts`: all capabilities.
- `src/auth/planCaps.ts`: all 22 `PlanFeature` values.
- `src/features/project/tabs-config.ts`: tab catalog.

---

## JSâ†’TS Migration (post-redesign cleanup)

**âœ… COMPLETE** â€” All 38 `.js` files in `src/lib/` + 2 `.js` files in `src/data/` have been migrated to `.ts`. Zero `.js`/`.jsx` files remain under `src/`.

## Auth Login Fix (Session 2026-07-28)

### Problem
Superadmin sign-in at `/staff/login` failed with `?error=session` after DB cleanup deleted auth users and profiles.

### Root Cause
1. `org_members.is_admin` column selected by `fetchAuthSession.ts` didn't exist in the live DB â†’ `db-error`
2. After fixing the column, profile was missing at the auth user's UUID â†’ `no-profile`

### Fixes Applied
| Change | File / Migration |
|--------|-----------------|
| Added `is_admin` column to `org_members` + `ensure_my_profile()` RPC | `migration 127` |
| Removed `is_admin` from SELECT, derive from `role` field | `fetchAuthSession.ts`, `delegationQueries.ts`, `orgMemberQueries.ts` |
| Auto-create missing profile on sign-in | `fetchAuthSession.ts` â€” calls `ensure_my_profile()` RPC on no-profile |
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
- **Gap 1**: sub_contractor â€” added `attendance:view` to identity + project-tier caps
- **Gap 2**: nav â€” added RA Bills (`/rabills`) item gated by `rabill:create` under Procurement group
- **Gap 3**: prospector â€” `defaultProjectTierFor()` returns `"pm"` instead of null
- **Gap 4**: duplicate icons â€” feature-flagsâ†’`flag`, brandingâ†’`image`, settings stays `sliders`
- **Gap 5**: handover â€” added `handover:generate` to PM + project_admin identity caps
- **Gap 6**: PM digest â€” added `digest:subscribe` + `digest:receive` to PM identity caps
- **Gap 7**: site_inspector Compliance nav â€” already works, no change needed
- **All 6 fixes**: TypeScript 0 errors, 94 files / 1201 tests pass

## Phase 4 â€” Component Library Consistency (Complete)

**All 19 `src/components/ui/` files** â€” zero palette classes remain:
- **Batch A** â€” `atoms.tsx`: BTN_VARIANT, Card, BADGE_TONE (5), ALERT (6), AV_BG (15), ProgressBar BAR (5), StatCard STAT (5), Tile (5) â€” all `cream-*`/`ink-*`/`safety-*`/`rose-*`/`emerald-*`/`amber-*`/`blue-*`/`violet-*`/`orange-*` â†’ semantic utilities
- **Batch B** â€” `status.ts` (8 entries) + `role-meta.ts` (22 entries): migrated to `bg-success-tint`, `bg-info-tint`, `bg-accent-tint`, `bg-elevated`, `text-success`, etc. Added CSS vars for 11 missing color families
- **Batch Câ€“E** â€” tabs, calendar, data table, forms, checkbox, switch, modal, dialog, etc.

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

## Phase 5 â€” Feature & Component Directory Migration (Complete)

All custom palette classes (`ink-*`, `cream-*`, `safety-*`, `amber-*`, `emerald-*`, `red-*`, `rose-*`, `blue-*`, `violet-*`, `stone-*`, `orange-*`) replaced with semantic `--st-*` CSS utilities across ~140 files:

| Batch | Scope | Files | Key patterns replaced |
|-------|-------|-------|-----------------------|
| A | `admin/` | 18 | `text-ink-*`, `bg-cream-*`, `border-safety-*`, etc. |
| B | `org/` | 34 | Same + `text-amber-*`, `bg-emerald-*`, `text-red-*` |
| C1 | `project/`, `share/`, `dashboards/`, `kiosk/`, `account/`, `dpr/` | 48 | + dark-theme kiosk colors (`bg-ink-700`, `border-amber-600`, `text-cream`) |
| C2 | `auth/`, `shell/`, `handover/`, `marketing/` | 22 | + `text-violet-*`, `bg-orange-*`, hover variants |
| D | `errorBoundary.tsx`, `UpiQr.tsx`, `atoms.tsx`, `PlanGate.tsx`, project tabs | 10 | Final cleanup |

**Verification** (all pass):
- `Select-String -Pattern "ink-|cream-|safety-|amber-|emerald-|rose-|violet-|stone-" src/**/*.{ts,tsx}` â†’ **0 matches** (intentional `bg-white` in toggle thumbs & tab badge overlay remain â€” 3 sites)
- `npx tsc --noEmit` â†’ **0 errors**

## Phase 6 â€” Mobile/Responsive (Complete â€” see the "Phase 6 â€” Mobile/Responsive (Complete)" section below)
- Mobile/responsive audit shipped: CalendarGrid `isMobile` list, Board stacked accordion, Tabs overflow indicator + fade, `xs:` 480px breakpoint, landing hamburger, `truncate`/`min-w-0` across cells.

---

## v4 Phase C0 â€” Company Segments Substrate (Complete)

### Goal
Introduce the org-level **company-segment** model (`organizations.segment`) that makes the platform segment-aware before the 4-segment product expansion (build order: Consultancy â†’ Architecture â†’ Construction â†’ Interior). Segments: `construction | architecture | interior | consultancy | multiple` (nullable = legacy org).

### Done (Tasks 1â€“11, all verified)
- **Migration 134** `scripts/supabase/134_org_segment.sql` â€” `organizations.segment` column + CHECK + index.
- **`src/auth/segmentConfig.ts`** (new) â€” `SEGMENT_CONFIG` (label/tagline/projectTypes/defaultProjectType), `isCompanySegment()`, `defaultProjectTypeFor()`, `segmentProjectTypes()`; exported via `src/auth/index.ts`.
- **OrgMembership.segment** â€” added to `src/auth/types.ts`; `normalizeOrgMembership()` reads it (unknown â†’ null, never rejects); org join select includes `segment`. Fixtures updated.
- **Segment-aware nav + tabs** â€” `NavItem.segments?` + 5th AND-gate in `buildNav`; `TabDef.segments?` + `segment`/`catalog` params on `visibleTabs`/`isTabVisible`; `DetailView.tsx` passes `activeSegment`.
- **8 new `PlanFeature`s** â€” Pro: `time_tracking`, `fee_billing`, `deliverables`, `review_rounds`, `ffe`; Business: `statutory`, `utilization`, `procurement`. (No new RBAC caps in C0.)
- **Registration** â€” `OrgRegisterView` segment picker; `RegisterInput.segment`; `register_org` EF validates (`VALID_SEGMENTS`, `invalid-segment` 400) + stamps `segment`.
- **Onboarding** â€” `OnboardingView` Step 1 segment picker (sets `projType` via `defaultProjectTypeFor`) + Step 3 project-type `<select>`; `onboardingQueries` fixed `orgs`â†’`organizations`, `getMyOrg` returns `segment`, `updateOrg(â€¦, segment?)`, `createProject` stamps `type`.
- **CreateProjectView** â€” type dropdown restricted to `segmentProjectTypes(activeOrg.segment)`, default preset from segment (null segment = full catalog, back-compat).
- **`orgs` bug** â€” canonicalized the out-of-band `orgs` view in **migration 135** `scripts/supabase/135_orgs_view.sql` (DROP+CREATE over `organizations` + latest `subscriptions.status` + latest succeeded `billing_history` charge /100 â†’ `mrr` INR). Repo is now self-contained; consumers: platformUsage/platformBilling/platformSupport queries + HandoverPacketView.
- **i18n** â€” `segment.label.*` + `segment.tagline.*` keys added to `en/hi/te.json`; OrgRegisterView + OnboardingView pickers and Onboarding Step 3 select now use `useT` (project types via `projType.*`).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean Â· `vitest` **97 files / 1232 tests pass** Â· `npm run smoke` **233 checks pass**.

### Deferred (needs user go)
- Segment-scoped plan contents / feature gating per segment (Phase C1+: Consultancy fixed-fee phases, `time_entries` table).

### Live DB apply (done 2026-07-31)
- Fixed `SUPABASE_DB_URL` in `.env.local` (fresh password + `postgres.<ref>` username on `aws-1-ap-south-1.pooler.supabase.com:6543`).
- `npm run db:apply` â†’ **96 passed / 28 failed**; C0 migrations **134** (`organizations.segment` added) and **135** (`orgs` view live, columns `id, slug, name, plan, status, mrr, created_at`) applied + verified.
- Fixed pre-existing **migration 121** bug (`p.email` â†’ correlated subquery on `auth.users`); `profiles.consent_version` + `consent_updated_at` now on live.
- Remaining 28 failures are **benign pre-existing** on the live DB: "already exists" on old migrations 01â€“31 & 119 (plain `CREATE POLICY`/`ADD CONSTRAINT` without guards â€” atomic rollback, no harm), 03/07 old narrow `profiles_role_check` re-add over current rows (constraint verified intact at 22 roles), 120 dev seed data (FK on fake UUIDs). Not caused by C0; old migrations would need `IF NOT EXISTS` guards for a fully-green run.

---

## v4 Phase C1 â€” Consultancy Segment (Complete, 2026-07-31)

### Goal
Ship the first v4 segment on top of the C0 substrate: **fixed-fee engagements** for consultant/design projects â€” fee phases, billable time entries, a deliverables register, design review rounds, and org-wide utilization reporting. Gated by project type (`consultant`/`design`) + `PlanFeature` + capability (NOT org segment). Full C1 shipped in one phase.

### Done (C1.0â€“C1.9, all verified)
- **C1.0 Plan caps + roles** â€” migration **136** `scripts/supabase/136_consultancy_feature_caps.sql` (jsonb-merge: basic all off; pro = time_tracking/fee_billing/deliverables/review_rounds; business = +utilization; enterprise/custom all on; sanity NOTICE loop). `src/auth/roles.ts` `VALID_PROJECT_ROLES_BY_TYPE` now adds `mep_consultant` + `structural_consultant` to `consultant` AND `design` projects; test "design + consultant accept specialist consultants".
- **C1.1 RBAC** â€” 8 new capabilities in `capabilities.ts`: `time:log`, `time:manage`, `phase:manage`, `deliverable:manage`, `deliverable:approve`, `review:comment`, `review:manage`, `utilization:view`. Assignment (identity + project tiers, mirrored): **contributor** (architect/senior/junior/design_architect_interior/designer/consultant/mep/structural) = time:log + deliverable:manage + review:comment; **manager** (design_head/consultant_head/pm/project_admin) = contributor + time:manage + phase:manage + deliverable:approve + review:manage + utilization:view; **orgadmin** (identity + `ADMIN_EXTRA_CAPS` in RoleResolver) = full set; **client** = review:comment only. Labels + "Consultancy Engagements" group added to `capabilityLabels.ts`. C1 tests in `tests/auth/permissionsMatrix.test.ts` (58 total now) incl. no-dead-caps.
- **C1.2â€“C1.4 Migrations (all applied live)**:
  - **137** `time_entries` â€” project_id, profile_id, date, activity, `hours CHECK (hours > 0 AND hours <= 24)`, billable default true, rate numeric(14,2) null, notes, created_at; RLS read=member / insert=self / update+delete=self or `is_orgadmin()`; grants.
  - **138** `fee_phases` â€” project_id, title, scope, `fee_amount bigint >= 0`, status draft/approved/in_progress/completed/cancelled, due_date, completed_date, sort_order; `ALTER invoices ADD phase_id FK`; RLS read=member / write=`is_orgadmin()` or identity role in pm/project_admin/design_head/consultant_head/superadmin.
  - **139** `deliverables` (phase_id FK, doc_type drawing/spec/report/model/schedule/certificate/other, status draft/in_review/approved/rejected/issued, due_date, owner_id) + `review_rounds` (deliverable_id, round_no>0 unique per deliverable, status open/closed, requested_by, comments, closed_by, closed_at); RLS read=member / deliverables insert+edit=member, delete=managers / review insert=member, update(close)=managers.
- **C1.5 Queries** â€” new `src/app/timeQueries.ts`, `phaseQueries.ts`, `deliverableQueries.ts`, `utilizationQueries.ts` (client-injected `Result<T>` pattern, camelCase mappers, join `profiles(name)`); helpers `committedFee`, `billableHours`, `entryValue`, `computeUtilization`, `nextRoundNo`; `financeQueries.createInvoice` accepts optional `phaseId`.
- **C1.6 Tabs** â€” `PhasesTab`, `TimeTab`, `DeliverablesTab`, `ReviewRoundsTab` in `src/features/project/tabs/` (MilestonesTab pattern: `useCan` + `useAction` + optimistic updates). `tabs-config.ts`: 4 new TabDefs gated `projectTypes: ["consultant","design"]` + planFeature (fee_billing / time_tracking / deliverables / review_rounds) + requires (phase:manage / time:log / deliverable:manage / review:comment). Wired in `DetailView.tsx`.
- **C1.7 Utilization** â€” `src/features/org/UtilizationView.tsx` at `/utilization` (lazy route in `router.tsx`), `<PlanGate feature="utilization">` + `<AccessDenied>` for `utilization:view`; fee vs billed-effort variance table (fee = committed phases; billed = Î£ billable h Ã— rate; utilization % = billed/fee). Nav item in `nav-config.ts` with `requires: "utilization:view"` + `segments: ["consultancy","architecture","multiple"]` â€” first real `segments` usage.
- **C1.8 i18n** â€” `projTab.phases/time/deliverables/reviews` keys added to `en/hi/te.json`.

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (4.05s) Â· `vitest` **98 files / 1264 tests pass** (+32: C1 permissionsMatrix, C1 tabsConfig, `tests/app/c1Queries.test.ts`) Â· `npm run smoke` **233 checks pass**.
- **Live DB apply**: `npm run db:apply` â†’ **100 passed / 28 failed** (28 = the same benign pre-existing). Migrations **136** (feature_caps live), **137**, **138** (`invoices.phase_id` added), **139** applied + verified (NOTICE rows=0, tables + policies created).

### Deferred (later phases)
- Per-phase utilization drill-down, deliverable file uploads (storage).

---

## v4 Phase C2 â€” Retainer & Hourly Billing (Complete, 2026-07-31)

### Goal
Turn approved consultancy time + monthly retainers into invoices. Rate cards give members project-level hourly rates; a manual per-month "Generate" flow (SECURITY DEFINER RPC, no cron) creates hourly / retainer invoices with source + period tags; a light org Revenue view rolls it up. Gated by project type (`consultant`/`design`) + `PlanFeature` + capability.

### Decisions (user-confirmed)
- **Full scope**: retainer + hourly + rate cards + time-approval workflow.
- **Manual generation** via a "Generate" button per month per retainer (and per project for hourly) â€” no cron.
- **Rate cards** are project-level (`rate_cards(project_id, profile_id, rate, effective_from)`).
- **Invoices stay flat** â€” no line items; added `source('phase'|'hourly'|'retainer')` + `period_from/to` + `retainer_id`.
- **Revenue view** is light, like Utilization (one table + stats).

### Done (C2.0â€“C2.9, all verified)
- **C2.0 Plan caps** â€” migration **140** `scripts/supabase/140_consultancy_billing_feature_caps.sql` (jsonb-merge: basic all off; pro = rate_cards/time_approval/retainer_billing/hourly_billing all true; business/enterprise/custom all true). `src/auth/planCaps.ts` `PlanFeature` adds the 4 features + `FEATURE_MIN_PLAN` ("pro") + `PLAN_FEATURE_LABEL`; planCaps.test.ts extended.
- **C2.1 RBAC** â€” 5 new capabilities in `capabilities.ts`: `rate:manage`, `time:approve`, `retainer:manage`, `billing:generate`, `revenue:view`. Granted (via replaceAll of `"utilization:view",`) to every manager block in `permissions-matrix.ts` (identity + project tiers) + `ADMIN_EXTRA_CAPS` in RoleResolver.ts. `capabilityLabels.ts` labels + domains (rate/retainerâ†’consultancy, billing/revenueâ†’finance). permissionsMatrix.test.ts C2 suites (+10 â†’ 68). Contributors + client get none.
- **C2.2 Time approval substrate** â€” migration **141** `scripts/supabase/141_rate_cards_time_approval.sql`: `rate_cards` table (rate CHECK â‰¥ 0, UNIQUE(project_id, profile_id, effective_from), RLS read=member / write=managers+orgadmin); `time_entries` ADD approval_status(pending/approved/rejected) default pending, approved_by, approved_at, billed default false, billed_invoice_id FK invoices, partial index unbilled. `timeQueries.ts` extended (ApprovalStatus, listTimeEntries select, approveTimeEntry RPC wrapper); c1Queries entry() factory + utilizationQueries + TimeTab updated.
- **C2.3 Retainers + RPCs** â€” migration **142** `scripts/supabase/142_retainers_invoice_generation.sql`: `retainers` table (monthly_amount bigint â‰¥ 0, status active/paused/cancelled, billing_day 1â€“28, RLS member-read/manager-write); `invoices` ADD source/period_from/period_to/retainer_id + indexes; 3 SECURITY DEFINER RPCs (`approve_time_entry`, `generate_hourly_invoice`, `generate_retainer_invoice`) â€” manager-gated, duplicate-period guard, invoice-no schemes `HRY-YYYYMM-md5` / `RTR-â€¦`, hourly marks entries billed atomically. `financeQueries.ts` Invoice type + listInvoices now carry source/period/retainerId/phaseId.
- **C2.4 Query layer** â€” new `src/app/rateCardQueries.ts` (RateCard, list/upsert/delete, pure `effectiveRate`), `src/app/retainerQueries.ts` (Retainer, RETAINER_STATUSES, `RETAINER_NEXT` activeâ†”paused / cancelled terminal, CRUD), `src/app/billingQueries.ts` (unbillableEntries, pendingApproval, unbilledSummary, unbilledByMember, billedToDate, billedBySource, retainerMrr, org-wide listOrgInvoices/listOrgRetainers, generate* RPC wrappers). `tests/app/c2Billing.test.ts` (13 tests incl. org-wide lister mocks).
- **C2.5 TimeTab approval workflow** â€” approve/reject/reopen via `approveTimeEntry` (gated `time:approve`), STATUS_TONE badges, billing badge, edit/delete only while pending, rate prefilled from rate cards via `effectiveRate`.
- **C2.6 BillingTab** â€” new `src/features/project/tabs/BillingTab.tsx` (rate cards + retainers + hourly generation + invoice list; sections self-`PlanGate` rate_cards / retainer_billing / hourly_billing; per-retainer from/to + Generate; Pause/Resume/Delete via RETAINER_NEXT). `tabs-config.ts` `billing` TabDef (`requiresAny: ["rate:manage","retainer:manage","billing:generate"]`, projectTypes consultant/design, no planFeature on the tab â€” sections gate internally); wired in DetailView.tsx.
- **C2.7 RevenueView** â€” new `src/features/org/RevenueView.tsx` at `/revenue` (lazy route), `<AccessDenied>` for `revenue:view` (no plan gate); stat cards (invoiced total / retainer MRR / hourly / phase) + per-project source-split table. Nav entry in `nav-config.ts` (`requires: "revenue:view"`, segments consultancy/architecture/multiple).
- **C2.8 i18n + comment sync** â€” `projTab.billing` keys added to en/hi/te.json; `66_rls_role_catalog_sync.sql` gained the comment-only C1+C2 capabilityâ†”RLS-gate map (step 4 of the capabilities.ts checklist â€” policies stay role-based).
- **C2.9 Tests + apply** â€” tabsConfig.test.ts C2 suite (+5 â†’ 28); full verify: lint + tsc + build clean, vitest **99 files / 1293 tests**, smoke **233 checks**.
- **C2.10 Hardening (review fixes)** â€” migration **143** `scripts/supabase/143_consultancy_billing_hardening.sql` + frontend fixes:
  - **Gate harmonization**: C1+C2 manager gates (`fee_phases_write`, `deliverables_delete`, `review_rounds_manage`, `rate_cards_write`, `retainers_write`, and the 3 RPCs) now ALSO accept project-tier managers via `has_project_role(<project>, 'pm','project_admin','design_head','consultant_head')` â€” previously identity-role-only, so a project-tier manager (e.g. global `architect` assigned `pm` on a project) saw UI controls but got 42501.
  - **Invoice uniqueness**: partial unique index `uq_invoices_project_source_period` on non-cancelled generated invoices (double-click/concurrency backstop).
  - **Post-approval edit lock**: `time_entries_edit_self`/`time_entries_delete_self` now require `pending AND NOT billed` for self edits (orgadmin unchanged) â€” closes the direct-API hole.
  - **RPC fixes**: `approve_time_entry` nulls `approved_by` on reopen-to-pending; `generate_retainer_invoice` rejects periods before `start_date` / after `end_date`.
  - **Frontend**: `BillingTab` success toast now shows after reload (was wiped); new `src/lib/dateLocal.ts` (`localDateISO`, `currentMonthRange`) replaces UTC `toISOString()` defaults in `BillingTab`/`TimeTab`/`rateCardQueries` (IST early-morning day/month shift); TimeTab `approved` badge is now green. New `tests/lib/dateLocal.test.ts` (6).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (5.16s) Â· `vitest` **99 files / 1293 tests pass** Â· `npm run smoke` **233 checks pass**.
- **Live DB apply**: `npm run db:apply` â†’ **103 passed / 28 failed** (28 = the same benign pre-existing). Migrations **140** (feature caps live), **141**, **142** applied + verified via pg: 3 RPCs present with correct signatures, time_entries approval/billed columns, invoices source/period/retainer_id/phase_id, rate_cards table (0 rows).
- **Hardening (143) applied**: `npm run db:apply` â†’ **104 passed / 28 failed** (same benign 28). Verified via pg: 7 recreated policies live, unique index `uq_invoices_project_source_period` present, all 3 RPCs contain `has_project_role`, reopen clears `approved_by`, retainer period bounds enforced. Full suite: **100 files / 1299 tests**, build 5.00s, smoke 233.

### Notes / Follow-ups
- RLS read on invoices/retainers/rate_cards is project-membership based, so org-wide rollups (utilization/revenue) only surface projects the caller is a member of â€” by design.
- **Manager gate**: identity roles (`pm`/`project_admin`/`design_head`/`consultant_head`) OR project-tier manager rows via `has_project_role` â€” matches permissions-matrix.ts. `current_role_text()` (identity) remains the base; org admin + superadmin bypass.
- **Cancelâ†’regenerate** an hourly/retainer invoice reuses the same deterministic `no` (allowed; `no` is unconstrained, only label collisions on the cancelled row).
- Migrations 140â€“142 are NOT re-runnable-mutating beyond idempotent guards; keep the C1 pattern (`if not exists`, drop-policy-if-exists) for any follow-ups.
- Phase C3 candidates: per-phase utilization drill-down, deliverable file uploads (storage), invoice line items, scheduled (cron) retainer generation.

## v4 Phase C3 â€” Consultancy Billing Depth (Complete, 2026-08-04)

### Goal
Deepen the C2 consultancy billing stack with per-phase time tracking, project-scoped utilization drill-down, deliverable file uploads, invoice line items, and fully automated retainer billing via pg_cron. Every step shipped with its own migration + frontend + tests + commit.

### Done (C3.0â€“C3.4, all verified)
- **C3.0+C3.1** commit `b98857f`: `time_entries.phase_id` (migration **144**, non-unique partial index, no new RLS policy); `buildPhaseRows` + `UNASSIGNED_PHASE_ID` in `utilizationQueries.ts`; UtilizationView drill-down + Unassigned bucket; `tests/app/c3Utilization.test.ts` (7). Also fixed pre-existing C2 TS errors (tabs-config icon, TimeTab Select/FeePhase, test fixtures).
- **C3.2** commit `113e5d9`: migration **145** â€” private storage bucket `deliverables` (50 MB, id=name) + 4 RLS policies (read=member, insert=member minus client/vendor/sub_contractor, update=member, delete=managers+orgadmin incl. `has_project_role`); `src/app/deliverableStorageQueries.ts`; DeliverablesTab upload/download/delete UI + `upload` icon; `tests/app/c3DeliverableStorage.test.ts` (9). Root-cause findings: `storage.foldername()` returns `text[]` (index `[1]`, never pass to `string_to_array`); compare folder `text` against `user_project_ids()::text`.
- **C3.3** commit `597a525`: migration **146** â€” `invoice_lines` table (description/qty/unit_price/amount bigint/sort_order, FK CASCADE, RLS read=member / write=managers+orgadmin) + both billing RPCs re-created to emit lines atomically (hourly = one line/member+rate via temp table `_hrly`; retainer = `coalesce(title,'Retainer')`, qty 1); `financeQueries.ts` `InvoiceLine` + `invoiceLinesTotal()`, `listInvoices`/`listOrgInvoices` embed lines; BillingTab + InvoicesTab render nested rows; `tests/app/c3InvoiceLines.test.ts` (6).
- **C3.4** commit `397d2d8`: migration **147** `scripts/supabase/147_retainer_cron.sql` â€” SECURITY DEFINER `admin_generate_due_retainer_invoices()`: loops ACTIVE retainers whose `billing_day = day(now() AT TIME ZONE 'Asia/Kolkata')`, period = current month `[1st..last day]`, honours `start_date`/`end_date` bounds (out-of-range â†’ `skipped_out_of_range`), idempotent via existing non-cancelled invoice check (`skipped_existing`), emits invoice `RTR-YYYYMM-md5` + line item, per-retainer exception isolation, returns outcome table; `GRANT` to **service_role only** (cron runs as postgres = owner; manual UI flow untouched); `cron.schedule('generate-due-retainers','5 2 * * *', ...)` (idempotent by name). Frontend: `autoBillingHint(billingDay)` pure helper in `retainerQueries.ts` + per-retainer "Auto-bills on day N each month" hint in BillingTab (active retainers only); `tests/app/c3RetainerCron.test.ts` (5).

### Verification
- Final C3.4 gate: `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` (4.65s) Â· `vitest` **104 files / 1326 tests** Â· `npm run smoke` **233 checks**.
- **Live DB apply**: `npm run db:apply` â†’ **108 passed / 28 failed** (28 = same benign pre-existing). 147 verified live via pg + functional probe: function exists, job `generate-due-retainers` (schedule `5 2 * * *`), grants svc=true/auth=false; end-to-end run generated invoice `RTR-202608-â€¦` + line, re-run â†’ `skipped_existing`, future-start retainer â†’ `skipped_out_of_range`; test rows cleaned.

### Notes / Follow-ups
- **Cron timezone**: billing_day is interpreted in IST (`now() AT TIME ZONE 'Asia/Kolkata'`); job fires 02:05 UTC daily.
- **C3.4 security posture**: the admin function is NOT callable by authenticated users (service_role grant only) â€” manual Generate keeps its manager gate. This blocks self-serve "run now"; acceptable per agreed scope.
- **Roadmap complete**: C0â†’C3.4 all shipped, verified, committed. Next candidates (needs user go): per-deliverable download audit, monthly statement PDF, push `prod` branch + live deploy.

---

## v4 Phase D â€” Architecture Segment Registers (Complete, 2026-08-04)

### Goal
Ship the architecture-segment register stack on the C0 substrate: storage-backed **drawing file register**, drawing **diff overlay** substrate, **FF&E schedule**, **statutory approvals / NOC register**, org-scoped **procurement quote-comparison** (with vendor portal submit), and **register cross-links** tying the registers to each other + the PO pipeline. Gated by plan feature (`ffe`/`statutory`/`procurement`, Business+) + capability + project type (arch/interior).

### Done (D0â€“D6, all verified)
- **D0** commit `5e7de08` â€” **migration 148** `scripts/supabase/148_arch_segment_feature_caps.sql` (jsonb-merge seeding the 3 C0 `PlanFeature`s into `plans.feature_caps`: proâ†’`ffe` true, business/enterprise/customâ†’`ffe`+`statutory`+`procurement` true, basic all off; sanity NOTICE loop).
- **D1** commit `a5d47bb` â€” **migration 149** `scripts/supabase/149_drawings_file_register.sql` (`drawings` + `drawing_files` in the shared `deliverables` bucket, member-read / released-client-read policies, insert/update members-minus-external, delete managers+orgadmin incl. `has_project_role`; `src/app/drawingFileQueries.ts` (folder/path/sanitize/formatBytes pure helpers + storage CRUD); DrawingsTab upload/download/delete; `tests/app/d1DrawingFiles.test.ts` (9)).
- **D2** commit `a46e93a` â€” **migration 150** `scripts/supabase/150_drawings_preview_url.sql` (`drawings.preview_url`); diff overlay substrate (`src/lib/drawingDiffPair.ts`, `src/app/drawingDiffSources.ts`, `DiffView`), DrawingsTab "compare revisions" + AR kiosk overlay; `tests/app/d2DrawingDiff.test.ts` (13).
- **D3** commit `b652dcc` â€” **migration 151** `scripts/supabase/151_ffe_schedules.sql` (`ffe_entries` CHECKs: category furniture/fixture/equipment, status specified/selected/ordered/installed/cancelled, qtyâ‰¥1, unit_costâ‰¥0; member read, member-minus-external write, manager delete); `src/app/ffeQueries.ts` (list/upsert/setStatus/delete + pure `committedCost`, `isCommittedStatus`, `ffeBudgetRollup`); FfeTab at `ffe` tab (projectTypes design/interior, planFeature ffe); `tests/app/d3Ffe.test.ts` (10).
- **D4** commit `3f7a62f` â€” **migration 152** `scripts/supabase/152_statutory_approvals.sql` (`statutory_approvals` NOC register: kinds fire/municipal/environment/electrical/labour/occupancy/other, statuses draft/applied/approved/rejected/expired, valid_until, costâ‰¥0; manager+orgadmin write); `src/app/statutoryQueries.ts` (+ pure `isExpiring(validUntil, today, days=30)`); StatutoryTab at `statutory` tab (design/interior/construction, planFeature statutory); `tests/app/d4Statutory.test.ts` (8).
- **D5** commit `8b3ff94` â€” **migration 153** `scripts/supabase/153_procurement_quotes.sql` (**org-scoped** `procurement_quotes`: org_id FK, ffe_entry_id FKâ†’ffe_entries set-null, project_id FK set-null, vendor_id FKâ†’vendors set-null, item_name free-text fallback, unit_priceâ‰¥0, qtyâ‰¥1, lead_days, valid_until, status requested/received/selected/rejected CHECK, notes, created_by; indexes (org_id,status)+(ffe_entry_id); RLS read=org member, insert=org-tier `vendor` OR manager set, update/delete=managers); `src/app/procurementQuotes.ts` (`listOrgQuotes` w/ vendor join, `upsertQuote`, `attachQuote`, `setQuoteStatus`, `deleteQuote`, `listOrgProjects`, pure `quoteTotal`, `isComparable`, `bestQuote`, `QUOTE_NEXT`); `src/app/financeQueries.ts` `createPO` accepts optional `vendorId`; `src/features/org/ProcurementView.tsx` at `/procurement` (PlanGate procurement + `procurement:view`; Mode A projectâ†’FF&E compare received quotes best-highlight â†’ **Raise PO** (createPO + mark selected); Mode B unassigned-quotes attach; manual quote form); `VendorPortalView` new **quotes tab** (org-tier vendor submit); nav `/procurement` (segments architecture/interior/multiple, Procurement group); `tests/app/d5Procurement.test.ts` (15) + navConfig suite.
- **D6** commit `TBD` â€” **migration 154** `scripts/supabase/154_po_quote_link.sql` (register cross-links):
  - `purchase_orders.quote_id` FK â†’ `procurement_quotes(id)` ON DELETE SET NULL + partial index (no RLS change).
  - `org_calendar()` recreated with a third **`kind='noc'`** branch: approved NOCs with `valid_until` within the next 30 days surface in the org `/calendar` agenda (member-gate identical to milestone/task branches).
  - `financeQueries.ts`: `PurchaseOrder` + `listPOs` carry `vendorId/vendorName/quoteId/quoteItem` (join `vendor:vendor_id(name)` + `quote:quote_id(item_name)`); `createPO` accepts `quoteId`.
  - `procurementQuotes.ts`: new project-scoped `listProjectQuotes(client, projectId)`.
  - `calendarQueries.ts`: `CalKind` = `"milestone"|"task"|"noc"`, mapped in `getOrgCalendar`.
  - `ProcurementView` Raise PO passes `quoteId: q.id`.
  - `POsTab`: "from quote" chip + **vendor Select** in the create form (`vendorQueries.listVendors`).
  - `FfeTab`: per-entry procurement surface (loads quotes + POs in parallel) â€” "N quotes Â· best â‚¹X" link â†’ `/procurement`, or "PO PO-XXX" once a selected quote has a linked PO.
  - `OverviewTab`: **Registers strip** â€” Drawings/FF&E/Statutory/POs count chips, each gated by the same rules as the target tab (`isTabVisible` â†’ capability + plan + segment + project-type), plus an amber "N NOC expiring in 30d" alert (`isExpiring`) â†’ Statutory tab.
  - `CalendarView`: NOC rows â†’ `/projects/{id}/statutory`, danger badge "NOC Â· Expiring".
  - `tests/app/d6CrossLinks.test.ts` (5: PO provenance mapper, listProjectQuotes mapper, getOrgCalendar noc mapping, bucketByDate NOC placement).

### Verification
- Final D6 gate: `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (6.38s) Â· `vitest` **110 files / 1411 tests pass** Â· `npm run smoke` **233 checks**.
- **Live DB apply**: `npm run db:apply` â†’ **115 passed / 28 failed** (28 = same benign pre-existing). 154 verified live via pg: `purchase_orders.quote_id` + FK + partial index present; `org_calendar` def contains the `'noc'` branch + authenticated grant intact; functional probe (gate removed, postgres role has no org membership so the RPC returns empty for it â€” same as milestone/task branches): within-30d approved NOC â†’ `kind=noc` row, >30d â†’ excluded; test rows cleaned.

### Notes / Follow-ups
- **D6 note**: `org_calendar` is a member-gated RPC â€” as `postgres` the gate (`is_superadmin() OR p_org = ANY(user_org_ids())`) yields empty for all branches; the D6 branch was functionally verified with the gate clause removed, matching how milestones/tasks behave.
- **Phase D complete**: D0â†’D6 all shipped, verified, committed. Next candidates (needs user go): Phase E (procurement purchase lifecycle depth, per-quote supplier scoring, cross-project FF&E rollups), push `prod` branch + live deploy.

---

## v4 Phase E â€” Procurement Purchase Lifecycle Depth (Complete, 2026-08-06)

### Goal
Extend the D6 quote â†’ PO chain through to settlement: **goods receipts** (partial deliveries) against a purchase order. Track each delivered batch (qty, unit-price snapshot, line amount, who recorded it), roll up received-vs-open settlement amounts org-wide, and surface per-PO delivery progress in the POs tab. Gated by project membership + the manager set (no new capability/plan gate â€” rides existing `po:create`/`po:approve` and `procurement:view`).

### Done (all verified)
- **Migration 158** `scripts/supabase/158_po_receipts.sql`:
  - `po_receipts` table (id, po_id FKâ†’purchase_orders ON DELETE CASCADE, received_date, qty CHECK â‰¥ 1, unit_price CHECK â‰¥ 0, amount CHECK â‰¥ 0, notes, received_by FKâ†’auth.users SET NULL, created_at) + `idx_po_receipts_po_id`.
  - **RLS project-scoped, mirroring purchase_orders**: read = `can_read_project(<po>.project_id)`, insert/update/delete = `can_write_project(<po>.project_id)` (manager set covers org admin + project-tier manager via `has_project_role`). `grant DML to authenticated`, revoke anon.
  - `org_purchase_orders(uuid)` **recreated** (DROP+CREATE â€” CREATE OR REPLACE can't add OUT params; verified no deps) to add `vendor_id, quote_id, quote_item, received_amount` (Î£ receipts) and `open_amount` (GREATEST(0, amount âˆ’ received)); same member gate as before.
- **`src/app/poReceiptQueries.ts`** (new) â€” `PoReceipt` + CRUD (`listPoReceipts` w/ `received_by(name)` join, `addPoReceipt` computes `amount = qty Ã— unit_price`, `deletePoReceipt`) + pure helpers `receiptAmount`, `receivedTotal`, `openAmount`, `deliveryProgress` (0â€“100, clamps over-delivery), `isFullyDelivered`.
- **`src/app/crossPoQueries.ts`** â€” `CrossPO` gained `receivedAmount`/`openAmount` mapped from the recreated RPC.
- **`src/features/project/tabs/POsTab.tsx`** â€” "Receipts" expandable per PO: delivery progress bar (emerald when 100%), received/open â‚¹, receipts list (received_by name), Add-receipt form (date/qty/unit â‚¹/notes) + delete (both gated by `po:approve`). Rows use an explicit Receipts button (dropped whole-row `onRowClick` to avoid a `<select>` nested inside a `<button>`, invalid HTML).
- **Tests** â€” new `tests/poReceipts.test.ts` (9: pure math + query mappers incl. error surfaces), `tests/crossPoQueries.test.ts` extended for received/open.

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (5.68s) Â· `npm run smoke` **233 checks** Â· `vitest` **122 files / 1548 tests pass** (+1 file / +9).
- **Live DB apply**: `npm run db:apply` â†’ **120 passed / 28 failed** (28 = same benign pre-existing). 158 verified live via pg: `po_receipts` columns + 4 RLS policies present; rebuilt `org_purchase_orders` OUT params include `received_amount`/`open_amount`.
- **Live deploy** (2026-08-06, commit `2809dc8`): pushed `prod`; Vercel site 200 OK.

### Notes / Follow-ups
- **`amount` snapshot**: receipts store a unit-price snapshot at receive time (not re-read from PO), so settlement value reflects the actual receipt; over-delivery (`Î£ receipts > PO amount`) clamps `open_amount` to 0 while `deliveryProgress` clamps at 100%.
- Candidate next sub-tasks (needs user go): all Phase D backlog complete (per-quote supplier scoring, cross-project FF&E rollups, deliverable download audit, monthly statement).

---

## v4 Phase E2 â€” Per-Quote Supplier Scoring (Complete, 2026-08-06)

### Goal
Rank comparable quotes as purchase sides so managers pick the **best value**, not just the cheapest. A composite 0â€“100 score blends price competitiveness (vs the cheapest comparable), lead time (vs the pool minimum), and the vendor's stored track record rating. Purely client-side â€” no schema change (reads existing `vendors.rating numeric(2,1)` 0â€“5).

### Done (all verified)
- **`src/app/procurementQuotes.ts`** â€” three pure helpers:
  - `scoreQuote(q, peers, vendorRating?)` â†’ `{ score, priceScore, leadScore, ratingScore }`. `priceScore = cheapestTotal/ownTotalÃ—100` (cheapest â†’ 100, 2Ã— premium â†’ 50); `leadScore = minLead/ownLeadÃ—100` (no lead â†’ 50, only-quote-with-lead â†’ 100); `ratingScore = rating/5Ã—100`. Final = `Î£ factor Ã— SCORE_WEIGHTS` (`{ price: 0.5, lead: 0.3, rating: 0.2 }`).
  - `bestScoredQuote(quotes, today, ratings)` â†’ top composite scorer among comparable quotes; ties fall to the lower quote total; null when nothing comparable.
  - `scoreQuoteAlone(rating?)` â†’ price/lead neutral at 50, only rating moves the total (per-quote display context).
- **`src/features/org/ProcurementView.tsx`** â€” each FF&E group computes `bestScoredQuote`; per-quote rows show a score badge (`Best value` â‰¥75 / `Good value` â‰¥55 / `Basic`, tone success/warning/neutral), `Â· score N/100` in the meta line, and the top scorer gets the accent border (previously the cheapest did â€” now "best value").
- **Tests** â€” new `tests/app/quoteScoring.test.ts` (9: price scale, lead scale, rating scale, weight sum, alone-neutral, best-selection, non-comparable exclusion, tie-break, weights export).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (5.96s) Â· `npm run smoke` **233 checks** Â· `vitest` **123 files / 1557 tests pass** (+1 file / +9).
- **Live deploy** (2026-08-06, commit `ad67268`): pushed `prod`; Vercel site 200 OK. No DB change.

### Notes / Follow-ups
- Scoring reads `vendors.rating` only â€” a 0â€“5 star value set via vendor directory / `setVendorRating`. Unrated vendors score neutral (50 on that factor), so they're not penalized for missing data.
- `bestQuote` (cheapest-only) still exported for callers that want raw price comparison; ProcurementView now highlights `bestScoredQuote`.
- Candidate next sub-tasks (needs user go): all Phase D backlog complete (cross-project FF&E rollup, deliverable download audit, monthly statement).

---

## v4 Phase E3 â€” Cross-Project FF&E Rollup (Complete, 2026-08-06)

### Goal
Lift the per-project FF&E schedule register to an **org-wide budget rollup** across design/interior projects: committed (non-cancelled qtyÃ—unit_cost) vs procured, split by status and category, with a per-project table + delivery-progress bar. Mirrors the `CrossProjectPOsView` + `RevenueView` org-rollup pattern (project list once, rows grouped back by project). No schema change.

### Done (all verified)
- **`src/app/ffeQueries.ts`** â€” refactored the row mapper into `mapFfeRow`/`FFE_SELECT` (shared by list + org fetch); added `FFE_STATUS_LABEL`/`FFE_CATEGORY_LABEL`, `FFE_PROJECT_TYPES` (`["design","interior"]`), `listOrgFfe(client, orgId)` (via `listProjectsByType` then a single `.in(project_id)` fetch grouped back by project â€” RLS member-gated), and the pure `ffeOrgRollup(projects) â†’ { projects, entries, committed, procured, byStatus, byCategory, byProject }`. Status/category buckets are pre-seeded in canonical order (zero slots show), byProject sorted by committed desc.
- **`src/features/org/FfeRollupView.tsx`** (new, `/ffe`) â€” `<PlanGate feature="ffe">` + `useCan("ffe:manage")`/AccessDenied; stat cards (Projects Â· Entries, Committed, Procured, Procured %); By-status + By-category cards; per-project `DataTable` with a Progress bar (emerald at 100%) and row-click â†’ `/projects/{id}/ffe`.
- **`src/plugins/catalog.ts`** â€” new **`design`** plugin owning the `ffe` route (route inherits module gate `design`; also makes `design` a nav-module owner, satisfying the catalogâ†”nav parity test).
- **`src/app/nav-config.ts`** â€” nav item `/ffe` "FF&E Rollup" under **Procurement** group: `requires: "ffe:manage"`, `segments: ["architecture","interior","multiple"]`, `modules: ["design"]`.
- **`scripts/smoke.mjs`** â€” added `FfeRollupView` to the app-source scan + `FfeRollupView`/`ffeOrgRollup` markers (235 checks).
- **Tests** â€” new `tests/app/e3FfeRollup.test.ts` (10: org rollup aggregation with cancelled excluded, status/category bucket seeding + ordering, per-project sort, empty rollup, listOrgFfe grouping/camelCase mapping, empty-entries, no-projects short-circuit, project-error + ffe-error surfacing).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (10.61s) Â· `npm run smoke` **235 checks** (was 233; +2) Â· `vitest` **124 files / 1567 tests pass** (+1 file / +10).
- **Live deploy** (2026-08-06, commit `c34ab20`): pushed `prod`; Vercel site 200 OK. No DB change.

### Notes / Follow-ups
- RLS read on `ffe_entries` is project-membership based, so the org rollup only surfaces projects the caller can already see â€” by design, consistent with utilization/revenue.
- `ffe:manage` is the same write gate the per-project FF&E tab uses for visibility, so the rollup matches tab-visible scope.
- Candidate next sub-tasks (needs user go): all Phase D backlog complete (deliverable download audit, monthly statement).

---

## v4 Phase E4 â€” Deliverable / Drawing Download Audit (Complete, 2026-08-06)

### Goal
Audit which files were downloaded from the shared `deliverables` bucket by whom, when, and from which register row (deliverable vs drawing). Append-only events are logged automatically on every signed-URL download in the Deliverables / Drawings tabs; this provides an org-wide rollup with a UI at `/download-audit`.

### Done (all verified)
- **Migration 159** `scripts/supabase/159_download_events.sql`: `download_events` table (id, project_id, register, ref_id, file_name, file_path, size_bytes, downloaded_by, downloaded_at) with RLS: read = project member; insert = self + member; no update/delete. Grants authenticated (select+insert), anon none.
- **`src/app/downloadAuditQueries.ts`** â€” pure decorators (decorateDownloadEvents) + org-rollup helpers (`logDownloadEvent`, `listOrgDownloadEvents`, `downloadTotals`). Mirrors the CrossProjectPOsView + RevenueView pattern.
- **`src/features/org/DownloadAuditView.tsx`** (new, `/download-audit`) â€” `<AccessDenied>` for (`deliverable:manage` OR `deliverable:approve` OR `drawings:upload`); stat cards (Downloads, Deliverables, Drawings); a filter to separate by register; per-event table (File, Project, Register, Downloaded by, Size, Time). Click-row opens the source (deliverable/drawing) tab.
- **`src/plugins/catalog.ts`** â€” new **`design`** plugin owning the `download-audit` route (module gate `design`; also satisfies catalogâ†”nav parity).
- **`src/app/nav-config.ts`** â€” nav item `/download-audit` "Download Audit" under Insights: `requiresAny: ["deliverable:manage", "deliverable:approve", "drawings:upload"]`, `modules: ["design"]`.
- **`scripts/smoke.mjs`** â€” added `DownloadAuditView`, `downloadAuditQueries`, `logDownloadEvent` to the app-source scan (237 checks).
- **Tests** â€” new `tests/app/e4DownloadAudit.test.ts` (10: totals, decorator, log events, org rollup error surfaces, invalid register coercion).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (5.61s) Â· `npm run smoke` **237 checks** (+2) Â· `vitest` **125 files / 1577 tests pass** (+2 files / +10 tests).
- **Live deploy** (2026-08-06, commit `1121312`): pushed `prod`; Vercel site 200 OK.

### Notes / Follow-ups
- RLS on `download_events` is project-scoped like the underlying storage, so only member downloads are surfaced â€” consistent with utilization/revenue.
- The event is logged asynchronously from the download handler (doesn't block the download UI).
- Candidate next sub-task (needs user go): all Phase D backlog complete.

---

## v4 Phase E5 â€” Monthly Statement (Complete, 2026-08-07)

### Goal
Org-wide monthly financial statement across all member projects: invoices split by source (phase/hourly/retainer), retainer MRR, expenses, RA bills, PO receipts, and consultancy billable hours/value. Mirrors RevenueView/UtilizationView org-rollup pattern. Gated by budget:view or revenue:view. Nav under Insights group with finance module. No schema change.

### Done (all verified)
- **`src/app/monthlyStatementQueries.ts`** â€” pure `buildMonthlyStatement` aggregator + `monthlyStatementTotals` + `listOrgMonthlyStatement(client, orgId, monthStart, monthEnd)`. Fetches projects once, then 6 parallel `.in(project_id)` queries (invoices, retainers, expenses, ra_bills, po_receipts, time_entries). Filters by month, groups by project, sorts by invoiced total desc. Handles edge cases: out-of-month invoices, paused/ended retainers, non-approved/non-billable time entries.
- **`src/features/org/MonthlyStatementView.tsx`** (new, `/monthly-statement`) â€” month selector (last 12 months), project-type filter, stat cards (Projects, Invoiced, MRR, Expenses, RA Bills, PO Receipts), per-project DataTable with all 10 financial columns. Uses `<AccessDenied>` for `budget:view` OR `revenue:view`.
- **`src/plugins/catalog.ts`** â€” route `monthly-statement` under `finance` plugin (module gate `finance`).
- **`src/app/nav-config.ts`** â€” nav item `/monthly-statement` "Monthly Statement" under Insights: `requiresAny: ["budget:view","revenue:view"]`, `modules: ["finance"]`.
- **`scripts/smoke.mjs`** â€” added `MonthlyStatementView`, `monthlyStatementTotals` markers (239 checks).
- **Tests** â€” new `tests/app/monthlyStatement.test.ts` (9: pure aggregator by source/MRR/expenses/RA/PO/time, totals, query mapper with project-list + 6-table join, error propagation, empty org short-circuit).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (3.72s) Â· `npm run smoke` **239 checks** (+2) Â· `vitest` **126 files / 1586 tests pass** (+1 file / +9).
- **Live deploy** (2026-08-07, commit `5d1f2e7`): pushed `prod`; Vercel site 200 OK. No DB change.

### Notes / Follow-ups
- RLS on all source tables is project-scoped, so the org rollup only surfaces projects the caller can already see â€” consistent with utilization/revenue.
- The view provides a complete financial snapshot for the selected month; PDF export can be added as a separate feature (print CSS or client-side PDF generation).
- **PDF export shipped** (2026-08-07, commit `d96545d`, prod live 200 OK): `src/app/monthlyStatementPdf.ts` â€” client-side A4 PDF via **jsPDF ^4.2** (new dep; no critical audit issues). `downloadMonthlyStatementPdf()` renders header (org + month label + generated timestamp), 5 summary cards (invoiced/MRR/expenses/RA/PO), a per-project 9-column table (8 numeric + name) with a totals row, and a footer note â€” all drawn with raw jsPDF text/fill APIs, no autotable dependency. `MonthlyStatementView` got a **Download PDF** button (disabled when no data). Tests `tests/app/monthlyStatementPdf.test.ts` (7: pdfRupees/pdfType/pdfMonthLabel helpers + A4 doc smoke).
- All Phase D backlog candidates now complete: cross-project FF&E rollup, deliverable download audit, monthly statement.

---

## v4 Phase 1 â€” Module System (Complete, 2026-08-06)

### Goal
First slice of the "One Platform, Multiple Industry Modules" strategy: an org-level **module registry** with per-industry (segment) templates, persisted on `organizations.enabled_modules`, driving module-gated nav + a `useModules()`/`<ModuleGate>` API and an onboarding module toggle. Build order for the broader v4 product: module substrate â†’ plugin registry (lazy routes) â†’ per-industry module surface.

### Done (all verified)
- **Migration 155** `scripts/supabase/155_enabled_modules.sql` â€” `organizations.enabled_modules` (text[], nullable, CHECK that every element âˆˆ 11 known ids, GIN index). NULL = not configured yet â†’ all modules enabled (back-compat); array = only those enabled.
- **`src/modules/`** (new): `types.ts` (`ModuleId`, `ModuleDef`, `EnabledModules` â€” zero runtime imports, safe for auth-layer import), `registry.ts` (11 modules, `MODULE_IDS`, `moduleById`, `isModuleId`, `normalizeModules` (drops unknowns/dedupes/null), `isModuleEnabled`, `CORE_MODULE='projects'`, `INDUSTRY_TEMPLATES` per segment, `templateModules`, `isRecommendedForSegment`, `alwaysOnModules`), `useModules.ts` (`{ enabledModules, isEnabled(id), orgId }` from active org), `ModuleGate.tsx` (renders children only if module enabled; null config â†’ render), `index.ts` barrel.
- **Auth session** â€” `OrgMembership.enabledModules?: EnabledModules` (types.ts); `normalizeOrgMembership` reads + normalizes it; org join select includes `enabled_modules` (fetchAuthSession.ts).
- **Nav gating** â€” `NavItem.modules?: ModuleId[]` (ANY-of gate) + 4th filter in `buildNav` (null config â†’ show, back-compat); applied to catalog: /clientâ†’clients, /procurement /vendors /pos /equipment /material-pricesâ†’procurement, /rabills /revenueâ†’finance, /dpr /handover /measurement-bookâ†’site_ops, /complianceâ†’compliance, /worklogs /hierarchyâ†’people, /forecast /analyticsâ†’insights, /utilizationâ†’consultancy, /vendorâ†’procurement, /kiosk/*â†’kiosks.
- **Onboarding Step 1** â€” segment pick now also renders a **module toggle** (pre-selected from the segment template, "Recommended"/"Always on" chips, projects locked on); `saveOrg` persists `enabled_modules` via `updateOrg(client, orgId, name, email, segment, modules)`; `getMyOrg` returns `enabled_modules`.
- **Tests** â€” new `tests/modules/registry.test.ts` (registry/normalize/templates); navConfig module-gating suite (incl. `/client` via `client` role which holds `share:client:portal`); fetchAuthSession + onboardingQueries extensions.

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (13.14s) Â· `vitest` **112 files / 1439 tests pass** (+23).
- Commit `3100cd5` (v4 Phase 1). Also committed `a3cb746` (fix recurring build failure: handover JSX, Badge size prop, invalid icons/capability, test fixes â€” 7 files).
- **Live DB apply**: `npm run db:apply` â†’ **118 passed / 28 failed** (28 = the same benign pre-existing). Migration **155** applied + verified live: `organizations.enabled_modules` present, GIN index + CHECK constraint live. `orgs with modules: 0` (correct until onboarding sets it).
- **Live deploy** (2026-08-06): pushed `prod`; Vercel Deploy + GitHub CI both green; site 200 OK at https://sitetrack-rakesh.vercel.app.
  - Note: `npm run smoke` initially failed 8 "App marker" checks for views that moved from router.tsx into the plugin catalog â€” fixed by adding `src/plugins/catalog.ts` to the smoke scan (commit `2c819bc`, "fix(smoke): scan plugin catalog for module-gated view markers").

### Next Phase
- Phase 2: **plugin registry** â€” âœ… Done (see v4 Phase 2 below).
- Phase 3: per-industry module surface â€” âœ… Done (see v4 Phase 3 below).

---

## v4 Phase 2 â€” Plugin Registry (Complete, 2026-08-06)

### Goal
The route surface of the Phase 1 module system: a **plugin catalog** (`src/plugins/`) that is the single source of truth for "which module owns which route", wired into the static router via `createPluginRoutes()` + a route-level `<ModuleGuard>` (Option A: static router kept, each module-gated route element wrapped in ModuleGuard; nav gating from Phase 1 remains the primary gate, ModuleGuard is defense-in-depth for direct URL access).

### Done (all verified)
- **`src/plugins/`** (new):
  - `types.ts` (`PluginDef`, `PluginRoute` (`path`, `modules` ANY-of, `lazy` factory, optional `stubId`), `PluginLazy` â€” type-only, zero runtime imports).
  - `catalog.ts` â€” `PLUGIN_CATALOG`: 9 plugins owning 24 routes, lazy `import()` factories moved verbatim from the old hardcoded router (clientsâ†’`/client`; site_opsâ†’`/dpr` `/dpr/history` `/handover`(also clients) `/measurement-book`; procurementâ†’`/vendors` `/procurement` `/pos` `/material-prices` `/equipment` `/vendor`; financeâ†’`/revenue`; insightsâ†’`/analytics` `/forecast`; consultancyâ†’`/utilization`; complianceâ†’`/compliance`; peopleâ†’`/worklogs` `/hierarchy`; kiosksâ†’`/kiosk/labour` `/kiosk/site` `/kiosk/ar` `/kiosk/snapshot` (stub-gated)). Helpers `pluginRoutes()` (flat) + `routeModules(plugin, route)` (route.modules ?? owning module).
  - `ModuleGuard.tsx` â€” route-level guard: renders children iff ANY required module is enabled for the active org (null `enabled_modules` â†’ render, back-compat); disabled â†’ `<AccessDenied>` card. Optional `fallback` prop.
  - `router.tsx` â€” `createPluginRoutes({ enabledModules? })`: converts catalog â†’ `RouteObject[]`, each wrapped in `<ModuleGuard>`; stub-gated routes additionally wrapped in `<StubGuard>`; optional `enabledModules` pre-filter (used by tests; future dynamic router).
  - `index.ts` barrel.
- **`src/app/router.tsx`** â€” module-gated routes replaced with `...createPluginRoutes()` spread in the shell children; the module-gated lazy imports moved to the catalog; non-module lazy views (org/admin/account/calendar/search/messages/pm/activity/audit/digest/delegations) stay hardcoded. NOTE: the pre-existing `/delegations` route was restored after being briefly dropped in the refactor.
- **Tests** â€” new `tests/plugins/catalog.test.ts` (structure: unique paths, valid module ids, owning-module coverage, `routeModules` fallback; nav-config parity: every module-gated nav item resolves to a catalog route or known non-route `/rabills` (no view yet, pre-existing gap), every nav module gate âˆˆ plugin owners). New `tests/plugins/router.test.ts` (`createPluginRoutes`: route count == catalog; `enabledModules:null` back-compat; ANY-of pre-filter keeps procurement routes + drops non-procurement; handover present when only clients enabled). Updated `tests/app/router.test.ts` â€” lazy-import scan now covers router.tsx + catalog.ts; module-gated path assertions moved to the catalog; asserts router.tsx spreads `createPluginRoutes()`.

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (10.05s) Â· `vitest` **114 files / 1454 tests pass** (+15).
- Commit `a4b0e7d` (v4 Phase 2).

### Notes / Follow-ups
- **Option A kept**: router stays static, all module routes always in the tree; `<ModuleGuard>` gates at render time using the active org's `enabled_modules`. No `enabledModules` at build time â†’ chunks are always emitted, but only loaded on navigation (unchanged from Phase 1). A future Option B (dynamic router built after auth loads) can reuse `createPluginRoutes({ enabledModules })`.
- **`/rabills`**: former known gap (nav-gated by `finance`, no view) â€” **closed 2026-08-07 (commit `2febcbd`)** with org-wide `CrossRaBillsView` at `/rabills` via `src/app/crossRaQueries.ts`, added to the finance plugin catalog. Now resolves to a real route (catalog.test.ts `KNOWN_NON_ROUTE` emptied).
- **`/delegations`**: non-module nav item (`org:approvals:manage`); route restored in router.tsx during the Phase 2 refactor.
- **Plugin catalog vs nav-config**: both still exist; the catalog owns moduleâ†’route, nav-config owns capability/segment/module gating for the sidebar. Deriving nav `modules` from the catalog is a possible later cleanup (deferred).

### Next Phase
- Phase 3: per-industry module surface â€” âœ… Done (see v4 Phase 3 below).

---

## v4 Phase 3 â€” Per-Industry Module Surface (Complete, 2026-08-06)

### Goal
Make the existing C1â€“D feature registers surface per-industry through the Phase 1 module system: (1) verify segment templates (`INDUSTRY_TEMPLATES`) match register reality, (2) gate module-specific tabs/views with `<ModuleGate>`, (3) add `module.*` i18n labels in en/hi/te. No schema change.

### Done (all verified)
- **`TabDef.moduleId?: ModuleId`** added to `src/features/project/tabs-config.ts` (26 tabs mapped): site_opsâ†’fieldops/safety/inspections/punchlist; designâ†’drawings/ffe; consultancyâ†’phases/time/deliverables/reviews/utilization/billing; financeâ†’budget/ledger/invoices/rabills; procurementâ†’po/materials; complianceâ†’statutory/compliance; peopleâ†’attendance/labour. Ungated (always visible): overview/team/milestones/tasks/updates/issues/rfi/changeorders/estimate/map/boq/gantt/messages/handover.
- **`visibleTabs()` / `isTabVisible()`** now accept a `moduleEnabled` predicate (5th gate, orthogonal to capability/plan/segment/project-type); `tabModuleId(id)` resolves a tabâ†’module. `DetailView.tsx` reads `useModules()` and drops tabs whose module is off (null config â†’ show, back-compat).
- **`DetailView.tsx`** â€” tab-content render wrapped in `<ModuleGate module={tabModuleId(activeId)}>` for module-owned tabs; Overview "Registers strip" count chips also module-gated (`isTabVisible` already covers them). Tab defs' `projectTypes`/`planFeature`/`requires` gates left intact (ModuleGate is additive defense-in-depth).
- **i18n** â€” 13 `module.*` label keys per locale added to `src/i18n/{en,hi,te}.json` (alpha-only ASCII keys, matching the migration 155 CHECK id set); `OnboardingView` reads `t(\`module.${m.id}.label\`)`.
- **Tests** â€” `tests/project/tabsConfig.test.ts` extended (+77): every tab that should be ModuleGate-wrapped is (moduleId present on 26), gating predicate works with moduleEnabled, `tabModuleId` round-trips, ungated tab set verified. Also touched: `OnboardingView.tsx` (+4), `OverviewTab.tsx` (+4).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean Â· `vitest` green (files/tests grew: baseline 114 files/1454 tests â†’ +tabsConfig suite).
- Commit `664e674` (v4 Phase 3).

### Notes / Follow-ups
- Module ownership per tab documented in `docs/MODULES.md` Â§3 table (three-place consistency rule: migration 155 CHECK â†” registry.ts â†” i18n).
- `/rabills` nav-gated-but-viewless gap **closed 2026-08-07** (commit `2febcbd`) â€” now an org-wide RA bills rollup route (see the v4 Phase 2 section note).

---

## Sprint 2 DPR â€” Real Submit Pipeline + Foundation (Complete, 2026-08-06)

### Goal
Ship the Sprint 2 WhatsApp DPR flow's code surface end-to-end on the shape agreed in `docs/SPRINT_2_ARCHITECTURE.md`: compose â†’ voice â†’ geotagged photo â†’ submit â†’ history â†’ detail â†’ retry, with offline queue, live BuildNow badge, and a shared real Meta Cloud API client. Real Bhashini/AWS transcription + BuildNow API access stay blocked on founder-provided API keys (provider-agnostic shells remain, mock adapter real).

### Done (commits `124ac31`, `28cdf0e`, `c2f6949`)
- **Real submit pipeline** (`124ac31`): `src/app/dprSubmit.ts` (379 ln â€” optimistic submit, photo/voice upload to storage, offline enqueue, delivery-log insert, BuildNow badge state); `src/app/dprQueries.ts` extended; `src/features/dpr/DPRDetailView.tsx` (208 ln new) + `PhotoGeotagCapture.tsx` (215 ln new, EXIF â†’ device GPS â†’ Hyderabad bbox); `src/lib/dprOfflineSync.ts` (drain/useOfflineSync); `DPRComposer.tsx` fully wired; route `/dpr/history` + catalog entry; migration **157** `scripts/supabase/157_dpr_media_bucket.sql` â€” private `dpr-media` bucket (15 MB, id=name) + 4 storage RLS policies (read/insert org-member minus client-ish roles, update org-member, delete managers+orgadmin incl. `has_project_role`), path `<org_id>/<date>/<sha256>.<ext>` using the validated `storage.foldername(name)[1] IN (user_org_ids()::text)` pattern from 145.
- **Shared Meta client + i18n** (`28cdf0e`): `supabase/functions/_shared/whatsapp_client.ts` (123 ln â€” real Meta Cloud API send text+template, `normalizeNumber`, token validation + rate-limit guard); `whatsapp-send` refactored to reuse it (83 ln removed) + `whatsapp_dpr_send` stub `sendViaMetaCloudApi` replaced with real body-composition send; `src/features/dpr/OfflineQueueBanner.tsx` standalone i18n banner; `VoiceNoteRecorder`/`DPRComposer`/`DPRHistoryView`/`DPRDetailView` i18n-wired via `useT()` (+composer language select driven by `voice.language.*`); `retryOk` boolean replaces brittle `startsWith("Send ok")`; ~71 new i18n keys per locale (`dpr.offline/recorder/history/detail` + 19 `dpr.composer.*`); i18n parity test extended to `dpr`/`voice`/`buildnow` flat + `dpr.*` deep; `tests/dpr/offlineQueueBanner.test.tsx`.
- **CI fix** (`c2f6949`): dropped unused React import in OfflineQueueBanner test (TS6133).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (8.8s) Â· `vitest` **118 files / 1502 tests pass** Â· `npm run smoke` **233 checks** (smoke marker added for new `/dpr/history` view + plugin-catalog scan).
- **Live DB**: migration **157** NOT yet applied live (pending in Phase F â€” `v4-db`). No prod deploy yet for this Sprint 2 work.

### Notes / Follow-ups
- **Phase B â€” DPR test coverage (done 2026-08-06, commit `96e30a2`)**: added `tests/dpr/digestPreview.test.ts` (pure previewDigest), `tests/dpr/efInternals.test.ts` (source-contract locks on Sprint 2 hardening: idempotent upserts `on_conflict=org_id,client_token` / `project_id,sync_date`, retry maxAttempts 3 + baseMs 1000, quota guard 402/budget-blocked, cache-first voice/binary, `message?.status` terminal cached path, auth gates), `tests/dpr/dprViews.test.ts` (exported `sortByStatus`/`sortByDate`/`STATUS_ORDER` from DPRHistoryView + `outcomeVisual`/`fmtDateTime` from DPRDetailView). Full gate: lint/tsc/build clean, smoke 233, vitest **121 files / 1539 tests** (+3/+37). Pushed `prod`; live 200 OK.
- `VoiceConfidenceBar.tsx` was dead code (never imported) â€” **removed 2026-08-07** (see below).
- Full status + execution log in `docs/SPRINT_2_DPR_RESEARCH.md`.

---

## Phase 6 â€” Mobile/Responsive (Complete, 2026-08-06)

### Done (commits `a986b8a`, `c37de9c`, `1abbbce`)
- **DPR history** (`a986b8a`) â€” row `flex-wrap` + audio `max-w-full` (prevents ~360px overflow).
- **CalendarGrid** â€” `isMobile` (min-width 640px) renders a stacked date list instead of the grid.
- **Board** â€” `isMobile` (min-width 768px) renders columns as a stacked accordion (`useMediaQuery`).
- **Tabs** â€” `overflow-x-auto scrollbar-hide` + right-edge gradient fade when `canScrollRight`, keyboard nav (Arrow/Home/End).
- **`xs:` breakpoint** â€” added `xs: "480px"` to `tailwind.config.js`.
- **Landing nav hamburger** â€” `mobileNavOpen` toggles an overlay drawer on `sm:hidden`.
- **Content wrap** â€” `truncate` / `min-w-0` across project tabs & dense cells.

Phase 6 fully shipped (matches work-board).





## Playwright Mocked Role-Access E2E (Complete, 2026-08-07)

### Goal
Credential-free, CI-runnable role-access coverage that renders the REAL v3 router + shell (not just unit-tested RBAC logic): per identity role, assert nav gating + <AccessDenied> on forbidden routes. The pre-existing e2e suites either hit live prod with hard-coded creds (`e2e/`, `playwright.config.ts`) or rely on `VITE_BACKEND=local` which disables Supabase entirely (`tests/e2e/`, `playwright.config.js`) - neither runs in CI.

### How it works (`e2e-mock/` + `playwright.mock.config.ts`)
- Boots local Vite in DEFAULT supabase mode (no `VITE_BACKEND=local`) so `getSupabaseClient()` returns a real client - the app hydrates the real authenticated shell.
- `e2e-mock/mockSupabase.ts`:
  - `seedSession()` plants a fake session in localStorage under `sb-<ref>-auth-token` (<ref> = bundled `PUBLIC_SUPABASE_URL` subdomain). supabase-js `auth.getSession()` reads it with ZERO network when the shape is valid (`access_token`/`refresh_token`/far-future `expires_at`) + `user.{id,email}`. Verified against `@supabase/auth-js` v2 source.
  - `mockSupabase()` `page.route`s `**://<ref>.supabase.co/**`, answering the REST tables `fetchAuthSession()` queries (`profiles`, `org_members`, `project_members`, `staff_area_grants`, + empty `role_capability_overrides`/`org_member_roles`/`org_role_capabilities`) with per-role canned rows. `rpc/set_tenant_context` failure is already swallowed in-app.
  - `openMockedApp()` = seed + route-mock + goto.
- `e2e-mock/role-access.spec.ts`: 6 tests (orgadmin, pm, client, superadmin; AccessDenied on `/admin` + `/org`).
- `scripts/e2e-mock-server.mjs`: Vite dev server on port 5176 (`E2E_MOCK_PORT`).

### Commands
- `npm run test:e2e:mock` - run the mocked suite (chromium only; `test:e2e` stays the live suite).

### Key gotchas (learned)
- Segment-gated nav items (`/client`, `/procurement`, `/ffe`) require the org to have a non-null `segment` - legacy orgs (null) hide them. Mock orgs must set `segment` (e.g. `"multiple"`) or those nav assertions fail.
- <AccessDenied> heading text is exactly "Access Restricted" - assert on that, not a loose `/access/i`.
- The files live outside `tsconfig` `include` (like `e2e/`) so Playwright transpiles them; ESLint only covers `scripts/*.mjs` from this set.

---

## v4 Phase A â€” CRM & Sales Lead Pipeline (Complete, 2026-08-07)

### Goal
First slice of the research's "Module 1: CRM & Sales" gap: an org-scoped lead pipeline â€” **Lead â†’ Meeting â†’ Quotation â†’ Agreement â†’ Client** â€” for all four segments (pre-sales is cross-industry). Gated by plan feature `crm` (Business+), capability `crm:view`/`crm:manage`, and module `crm` (all segment templates now include it).

### Done (commit `f62f848`, all verified)
- **Migration 161** `scripts/supabase/161_crm_leads.sql` â€” `leads` (stage CHECK: new/contacted/meeting_scheduled/quotation_sent/negotiating/agreement_signed/won/lost, source CHECK, budget/won_amount â‰¥ 0), `lead_meetings` (outcome CHECK), `lead_quotations` (status CHECK), `lead_agreements` (status CHECK). **Org-scoped** (no project_id â€” leads precede projects). RLS: read/insert/update = any org member (`user_org_ids()`), delete = managers (orgadmin/pm/project_admin/superadmin); child tables gate via their lead's org. Grants DML to authenticated, revoke anon. **Also** drops + re-adds the 155 `enabled_modules` CHECK to admit the new `crm` module id (JS source of truth stays `src/modules/registry.ts`).
- **Capabilities** â€” `crm:view` (see pipeline), `crm:manage` (create/update leads + meetings/quotes/agreements). Grants (identity): orgadmin + prospector manage; pm + project_admin view; contributors/client/vendor/sub_contractor none. Labels added. `66_rls_role_catalog_sync.sql` comment sync is the pending follow-up for the capabilities checklist (RLS is role-based so no code change).
- **Plan feature** `crm` (Business+, min plan "business", label "Sales pipeline (CRM & leads)") in `planCaps.ts`.
- **Module** `crm` added to `src/modules/types.ts` (ModuleId), `registry.ts` (MODULES + all 4 INDUSTRY_TEMPLATES), i18n `module.crm.*` in en/hi/te.
- **`src/app/crmQueries.ts`** â€” `listOrgLeads` / `createLead` / `updateLead` / `setLeadStage` / `deleteLead` + meetings/quotes/agreements CRUD; pure helpers `crmRollup` (total/open/won/lost/pipelineValue/wonValue/byStage/conversionRate), `isOpenLead`, `LEAD_STAGE_NEXT`, `reopenLead`; org-scoped select (no project indirection).
- **`src/features/org/CrmView.tsx`** at `/crm` â€” `<PlanGate feature="crm">` + `useCan("crm:view")` AccessDenied; funnel stat cards (Leads/Open/Pipeline/Won/Win rate/stage split), stage filter, New-lead modal, lead drawer with Meetings/Quotations/Agreements panels (add + advance + sign/delete, each `crm:manage`-gated). Nav item "Pipeline" under a new **Sales** group (`requires: "crm:view"`, `modules: ["crm"]`, cross-segment). Plugin catalog `crm` plugin owns the route.
- **Tests** â€” `tests/app/crmQueries.test.ts` (13: enums, isOpenLead, LEAD_STAGE_NEXT, reopenLead, crmRollup totals/conversion/empty-buckets/null-budget, listOrgLeads mapper + unknown coercion + error, createLead insert body). `tests/auth/permissionsMatrix.test.ts` CRM block (manage roles, view-only roles, deny list, no-dead-caps).

### Verification
- `npm run lint` clean Â· `npx tsc --noEmit` clean Â· `npm run build` clean (15.71s) Â· `vitest` **131 files / 1614 tests pass** (+5 / +28) Â· `npm run smoke` **249 checks** (was 239; +10 incl. CrmView/crmQueries/crmRollup markers + source files) Â· `npm run test:e2e:mock` **6/6** (orgadmin test now asserts the **Pipeline** nav link renders through the real router with a mocked crm:view session).
- **NOT yet applied live** (migration 161 pending â€” apply with `npm run db:apply` + push `prod` when this phase group ships, matching the Phase F live-deploy cadence).

### Notes / Follow-ups
- RLS write is "any org member" (not manager-only) for insert/update â€” the UI gates writes behind `crm:manage`; delete is manager-only (matches procurement_quotes posture). If a stricter write gate is wanted later, add `is_orgadmin()` / role checks to the insert/update policies.
- Leads are deliberately **not** tied to projects (they precede project creation); when a won lead becomes a project, the salesâ†’project handoff can be a follow-up sub-task (A6 candidate).
- Candidate next sub-tasks (needs user go): salesâ†’project handoff (create project from a won lead), per-owner pipeline view, quotationâ†’agreement auto-conversion, CRM i18n (`crm.*` keys in en/hi/te), then Phase B (interior module surface).
---

## v4 Phases D–F — Risk Analytics + Design-Workflow + Per-Org Branding (Complete, 2026-08-07)

### Phase D — Deterministic Risk Analytics (commit `259f1d7`)
- `src/app/riskQueries.ts` — pure `computeRiskSignals(input, today)` + `riskLevel(score)`: folds schedule slip (>=3d overdue milestones), budget overrun/burn (>=100%/>=80% of allocated), high-severity open issues, and RFI lag (>=3d) into a 0–100 score with low<25<medium<45<high<70<critical levels, delayProbability (score/100, capped 0.9) and delayDays (max slip). Weights: high=34 / medium=20.
- `src/features/project/RiskSignalsCard.tsx` — fetches milestones/issues/expenses/rfis + project budget, feeds the pure model, renders a level-toned card with score bar + per-signal rows. Mounted in OverviewTab after the statutory-expiry alert.
- Tests `tests/app/dRisk.test.ts` (14); fixed inverted diffDays sign for overdue milestones.

### Phase E — Architecture Design-Workflow Lifecycle (commits `e0baba3`, `7386042`, `4dfbd1b`) — implemented the three agreed representation options in sequence:
- **Opt1 (derived, pure)**: `src/app/designWorkflow.ts` — ladder requirements → concept → floorplan → elevation → 3d → client_review → approved, `computeDesignStage`/`drawingStage`/`nextStage`/`prevStage`/`isStageReached`/`isApprovedSignal` computed from the drawings register (title/type/status signals; only *released/current* drawings progress). Tests eDesignWorkflow (15).
- **Opt2 (persisted per-project)**: migration **165** `scripts/supabase/165_design_workflow.sql` — `design_workflow` table (project_id UNIQUE, stage_order 0–6 CHECK, review/approve annotations, manager+orgadmin+project-tier RLS mirroring 163) + `src/app/designWorkflowQueries.ts` (get/ensure/advance/review/approve/reset + clamped `designStageFromOrder`) + DrawingsTab **Design workflow** stepper with Advance/Approve. Tests eDesignWorkflowQueries (10).
- **Opt3 (per-drawing stage)**: migration **166** `scripts/supabase/166_design_workflow_per_drawing.sql` — `drawings.design_stage` column (ladder CHECK, default concept); `Drawing.designStage` + `setDrawingStage`; `drawingStage` now prefers the persisted value; DrawingsTab per-drawing stage Select.

### Phase F — Per-Org Branding + Dynamic Page Title (commit `63e9387`)
- `src/features/shell/useOrgBranding.ts` — `resolveShellBranding` + hook fetching the org-level `branding` row (migration 23) over the platform default (best-effort, fails silent).
- `src/features/shell/brandingCss.ts` — `ACCENT_THEMES` swatch → accent-family map, `normalizeAccent`, `accentToCssVars` (sets `--st-accent`/`-rgb`/`-2`/`-light`/`-tint`).
- `src/features/shell/BrandingEffect.tsx` — mounted in the gated shell; applies accent CSS vars to `:root` + sets `document.title` to `<orgName> — SiteTrack Pro` (reset on unmount).
- `TopBar` — renders org logo (or letter mark), org name/tagline instead of the hardcoded `S`/`SiteTrack Pro` block.
- Tests `tests/app/fBranding.test.ts` (7). Note: DB `theme` CHECK (editorial/classic/modern/dark) still diverges from UI `editorial/operational` — pre-existing, untouched.

### Final gate + live push (2026-08-07)
- Full verify: lint clean · tsc clean · build clean · vitest **137 files / 1716 tests pass** · smoke **255 checks** · `npm run test:e2e:mock` **7/7**.
- `npm run db:apply` → **128 passed / 28 failed** (28 = same benign pre-existing already-exists rows); migrations **161–166** all applied + NOTICE-verified live (leads=0, design_workflow table + manager/orgadmin write policies, drawings.design_stage column).
- `git push origin prod` (7a55996..63e9387) → Vercel auto-deploy; live https://sitetrack-rakesh.vercel.app returns **200**.

### Notes / Follow-ups
- Risk card reads project `budget` directly (projects table) - RLS member-scoped like the other feeds; no new capability/plan gate (rides Overview visibility).
- Design-workflow stepper Advance/Approve gated by `canEdit` (drawings:upload) in DrawingsTab; backend RLS enforces manager/orgadmin/project-tier.
- Branding is org-level only (project overrides exist in the table but are not surfaced in the shell); subdomain white-label deferred per plan F0.

---

## v5 Phase G1 — Material Request → PO → GRN → Inventory Chain (Complete, 2026-08-07)

### Goal
Close the construction procurement loop: a project-scoped **material request** register (requested → approved → ordered → received), a request→PO provenance link (mirroring quote_id), and an automatic **GRN** that posts each goods receipt into the inventory ledger so inward stock is never manually double-entered. No new capability/plan gate — rides existing `material:add` / `po:create` / `po:approve`.

### Done (all verified)
- **Migration 167** `scripts/supabase/167_material_requests_grn.sql`:
  - `material_requests` (project_id, item, unit, qty CHECK > 0, need_date, reason, status CHECK requested/approved/ordered/received, requested_by FK, approved_by FK, po_id FK→purchase_orders SET NULL, notes, timestamps) + indexes.
  - **RLS project-scoped**: read = member (`can_read_project`); insert = member (anyone can raise); update = manager gate with a self-cancel escape hatch (raiser may update own row via `can_read_project` while forwards are `can_write_project`); delete = manager gate (`can_write_project` covers org admin + project-tier manager via `has_project_role`).
  - `purchase_orders.material_request_id` FK + partial index (request → PO provenance).
  - **GRN trigger** `grn_post_inventory()` (SECURITY DEFINER, search_path=public) on `po_receipts` AFTER INSERT → inserts `inventory_transactions` **inward** row (material from linked request item, fallback to PO items; unit from request default `nos`; qty = receipt qty; source `po_receipt`; ref_no = PO no; po_id; recorded_by = receipt's received_by) and marks the linked request `received`. SECURITY DEFINER lets an org admin (outside the narrow architect/pm/contractor `write_inventory` set) still auto-post.
- **`src/app/materialRequestQueries.ts`** (new) — `MaterialRequest` + CRUD (`listMaterialRequests` w/ requested_by/approved_by name joins, `createMaterialRequest`, `setMaterialRequestStatus` (stamps `approved_by` on approve), `deleteMaterialRequest`) + pure helpers `REQUEST_NEXT`, `REQUEST_STATUS_LABEL`, `requestTotals`, `isOpenRequest`.
- **`src/app/financeQueries.ts`** — `PurchaseOrder` gained `materialRequestId/materialRequestItem`; `listPOs` joins `material_request:material_request_id(item)`; `createPO` accepts optional `materialRequestId`.
- **UI** — `MaterialsTab`: new **Material Requests** card (open/received totals, status chips, create form item/unit/qty/need-by/reason, per-row advance button walking the ladder + delete). `POsTab`: create form gained **From request** select (open requests only); PO rows show `request "<item>"` provenance chip.
- **Tests** — `tests/app/g1MaterialRequests.test.ts` (11: REQUEST_NEXT ladder, labels, isOpenRequest, requestTotals bucket + empty, list mapper w/ joins + coercion + unknown-status fallback + error, create insert body, setStatus stamps approved_by only-on-approve + error, delete error).

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (2.99s) · `npm run smoke` **259 checks** (was 255; +3 markers `listMaterialRequests`/`requestTotals`/`REQUEST_NEXT` + migration 167 required-file) · `vitest` **138 files / 1727 tests pass** (+1 file / +11) · `npm run test:e2e:mock` **7/7**.
- **NOT yet applied live** (migration 167 pending — apply with `npm run db:apply` + push `prod` when the phase group ships, matching the Phase F cadence).

### Notes / Follow-ups
- **GRN source of truth**: material/unit for the inventory row come from the linked request when present, else the PO's `items` free text (unit defaults `nos`). A receipt on a PO without a request still posts inventory (item = PO items) so partial deliveries are always captured.
- **Self-cancel escape hatch**: the `mr_update` with-check allows `can_read_project` (any member) so a raiser can withdraw their own row, while forward status moves require the manager write gate. Delete stays manager-only.
- Next: G2 (checklist inspections + corrective actions, migration 168), G3 (shift roster/overtime/wages/EPF-ESI, migration 169), then G4/G5.

