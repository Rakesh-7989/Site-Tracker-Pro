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

---

## v4 Phase C0 — Company Segments Substrate (Complete)

### Goal
Introduce the org-level **company-segment** model (`organizations.segment`) that makes the platform segment-aware before the 4-segment product expansion (build order: Consultancy → Architecture → Construction → Interior). Segments: `construction | architecture | interior | consultancy | multiple` (nullable = legacy org).

### Done (Tasks 1–11, all verified)
- **Migration 134** `scripts/supabase/134_org_segment.sql` — `organizations.segment` column + CHECK + index.
- **`src/auth/segmentConfig.ts`** (new) — `SEGMENT_CONFIG` (label/tagline/projectTypes/defaultProjectType), `isCompanySegment()`, `defaultProjectTypeFor()`, `segmentProjectTypes()`; exported via `src/auth/index.ts`.
- **OrgMembership.segment** — added to `src/auth/types.ts`; `normalizeOrgMembership()` reads it (unknown → null, never rejects); org join select includes `segment`. Fixtures updated.
- **Segment-aware nav + tabs** — `NavItem.segments?` + 5th AND-gate in `buildNav`; `TabDef.segments?` + `segment`/`catalog` params on `visibleTabs`/`isTabVisible`; `DetailView.tsx` passes `activeSegment`.
- **8 new `PlanFeature`s** — Pro: `time_tracking`, `fee_billing`, `deliverables`, `review_rounds`, `ffe`; Business: `statutory`, `utilization`, `procurement`. (No new RBAC caps in C0.)
- **Registration** — `OrgRegisterView` segment picker; `RegisterInput.segment`; `register_org` EF validates (`VALID_SEGMENTS`, `invalid-segment` 400) + stamps `segment`.
- **Onboarding** — `OnboardingView` Step 1 segment picker (sets `projType` via `defaultProjectTypeFor`) + Step 3 project-type `<select>`; `onboardingQueries` fixed `orgs`→`organizations`, `getMyOrg` returns `segment`, `updateOrg(…, segment?)`, `createProject` stamps `type`.
- **CreateProjectView** — type dropdown restricted to `segmentProjectTypes(activeOrg.segment)`, default preset from segment (null segment = full catalog, back-compat).
- **`orgs` bug** — canonicalized the out-of-band `orgs` view in **migration 135** `scripts/supabase/135_orgs_view.sql` (DROP+CREATE over `organizations` + latest `subscriptions.status` + latest succeeded `billing_history` charge /100 → `mrr` INR). Repo is now self-contained; consumers: platformUsage/platformBilling/platformSupport queries + HandoverPacketView.
- **i18n** — `segment.label.*` + `segment.tagline.*` keys added to `en/hi/te.json`; OrgRegisterView + OnboardingView pickers and Onboarding Step 3 select now use `useT` (project types via `projType.*`).

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean · `vitest` **97 files / 1232 tests pass** · `npm run smoke` **233 checks pass**.

### Deferred (needs user go)
- Segment-scoped plan contents / feature gating per segment (Phase C1+: Consultancy fixed-fee phases, `time_entries` table).

### Live DB apply (done 2026-07-31)
- Fixed `SUPABASE_DB_URL` in `.env.local` (fresh password + `postgres.<ref>` username on `aws-1-ap-south-1.pooler.supabase.com:6543`).
- `npm run db:apply` → **96 passed / 28 failed**; C0 migrations **134** (`organizations.segment` added) and **135** (`orgs` view live, columns `id, slug, name, plan, status, mrr, created_at`) applied + verified.
- Fixed pre-existing **migration 121** bug (`p.email` → correlated subquery on `auth.users`); `profiles.consent_version` + `consent_updated_at` now on live.
- Remaining 28 failures are **benign pre-existing** on the live DB: "already exists" on old migrations 01–31 & 119 (plain `CREATE POLICY`/`ADD CONSTRAINT` without guards — atomic rollback, no harm), 03/07 old narrow `profiles_role_check` re-add over current rows (constraint verified intact at 22 roles), 120 dev seed data (FK on fake UUIDs). Not caused by C0; old migrations would need `IF NOT EXISTS` guards for a fully-green run.

---

## v4 Phase C1 — Consultancy Segment (Complete, 2026-07-31)

### Goal
Ship the first v4 segment on top of the C0 substrate: **fixed-fee engagements** for consultant/design projects — fee phases, billable time entries, a deliverables register, design review rounds, and org-wide utilization reporting. Gated by project type (`consultant`/`design`) + `PlanFeature` + capability (NOT org segment). Full C1 shipped in one phase.

### Done (C1.0–C1.9, all verified)
- **C1.0 Plan caps + roles** — migration **136** `scripts/supabase/136_consultancy_feature_caps.sql` (jsonb-merge: basic all off; pro = time_tracking/fee_billing/deliverables/review_rounds; business = +utilization; enterprise/custom all on; sanity NOTICE loop). `src/auth/roles.ts` `VALID_PROJECT_ROLES_BY_TYPE` now adds `mep_consultant` + `structural_consultant` to `consultant` AND `design` projects; test "design + consultant accept specialist consultants".
- **C1.1 RBAC** — 8 new capabilities in `capabilities.ts`: `time:log`, `time:manage`, `phase:manage`, `deliverable:manage`, `deliverable:approve`, `review:comment`, `review:manage`, `utilization:view`. Assignment (identity + project tiers, mirrored): **contributor** (architect/senior/junior/design_architect_interior/designer/consultant/mep/structural) = time:log + deliverable:manage + review:comment; **manager** (design_head/consultant_head/pm/project_admin) = contributor + time:manage + phase:manage + deliverable:approve + review:manage + utilization:view; **orgadmin** (identity + `ADMIN_EXTRA_CAPS` in RoleResolver) = full set; **client** = review:comment only. Labels + "Consultancy Engagements" group added to `capabilityLabels.ts`. C1 tests in `tests/auth/permissionsMatrix.test.ts` (58 total now) incl. no-dead-caps.
- **C1.2–C1.4 Migrations (all applied live)**:
  - **137** `time_entries` — project_id, profile_id, date, activity, `hours CHECK (hours > 0 AND hours <= 24)`, billable default true, rate numeric(14,2) null, notes, created_at; RLS read=member / insert=self / update+delete=self or `is_orgadmin()`; grants.
  - **138** `fee_phases` — project_id, title, scope, `fee_amount bigint >= 0`, status draft/approved/in_progress/completed/cancelled, due_date, completed_date, sort_order; `ALTER invoices ADD phase_id FK`; RLS read=member / write=`is_orgadmin()` or identity role in pm/project_admin/design_head/consultant_head/superadmin.
  - **139** `deliverables` (phase_id FK, doc_type drawing/spec/report/model/schedule/certificate/other, status draft/in_review/approved/rejected/issued, due_date, owner_id) + `review_rounds` (deliverable_id, round_no>0 unique per deliverable, status open/closed, requested_by, comments, closed_by, closed_at); RLS read=member / deliverables insert+edit=member, delete=managers / review insert=member, update(close)=managers.
- **C1.5 Queries** — new `src/app/timeQueries.ts`, `phaseQueries.ts`, `deliverableQueries.ts`, `utilizationQueries.ts` (client-injected `Result<T>` pattern, camelCase mappers, join `profiles(name)`); helpers `committedFee`, `billableHours`, `entryValue`, `computeUtilization`, `nextRoundNo`; `financeQueries.createInvoice` accepts optional `phaseId`.
- **C1.6 Tabs** — `PhasesTab`, `TimeTab`, `DeliverablesTab`, `ReviewRoundsTab` in `src/features/project/tabs/` (MilestonesTab pattern: `useCan` + `useAction` + optimistic updates). `tabs-config.ts`: 4 new TabDefs gated `projectTypes: ["consultant","design"]` + planFeature (fee_billing / time_tracking / deliverables / review_rounds) + requires (phase:manage / time:log / deliverable:manage / review:comment). Wired in `DetailView.tsx`.
- **C1.7 Utilization** — `src/features/org/UtilizationView.tsx` at `/utilization` (lazy route in `router.tsx`), `<PlanGate feature="utilization">` + `<AccessDenied>` for `utilization:view`; fee vs billed-effort variance table (fee = committed phases; billed = Σ billable h × rate; utilization % = billed/fee). Nav item in `nav-config.ts` with `requires: "utilization:view"` + `segments: ["consultancy","architecture","multiple"]` — first real `segments` usage.
- **C1.8 i18n** — `projTab.phases/time/deliverables/reviews` keys added to `en/hi/te.json`.

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (4.05s) · `vitest` **98 files / 1264 tests pass** (+32: C1 permissionsMatrix, C1 tabsConfig, `tests/app/c1Queries.test.ts`) · `npm run smoke` **233 checks pass**.
- **Live DB apply**: `npm run db:apply` → **100 passed / 28 failed** (28 = the same benign pre-existing). Migrations **136** (feature_caps live), **137**, **138** (`invoices.phase_id` added), **139** applied + verified (NOTICE rows=0, tables + policies created).

### Deferred (later phases)
- Per-phase utilization drill-down, deliverable file uploads (storage).

---

## v4 Phase C2 — Retainer & Hourly Billing (Complete, 2026-07-31)

### Goal
Turn approved consultancy time + monthly retainers into invoices. Rate cards give members project-level hourly rates; a manual per-month "Generate" flow (SECURITY DEFINER RPC, no cron) creates hourly / retainer invoices with source + period tags; a light org Revenue view rolls it up. Gated by project type (`consultant`/`design`) + `PlanFeature` + capability.

### Decisions (user-confirmed)
- **Full scope**: retainer + hourly + rate cards + time-approval workflow.
- **Manual generation** via a "Generate" button per month per retainer (and per project for hourly) — no cron.
- **Rate cards** are project-level (`rate_cards(project_id, profile_id, rate, effective_from)`).
- **Invoices stay flat** — no line items; added `source('phase'|'hourly'|'retainer')` + `period_from/to` + `retainer_id`.
- **Revenue view** is light, like Utilization (one table + stats).

### Done (C2.0–C2.9, all verified)
- **C2.0 Plan caps** — migration **140** `scripts/supabase/140_consultancy_billing_feature_caps.sql` (jsonb-merge: basic all off; pro = rate_cards/time_approval/retainer_billing/hourly_billing all true; business/enterprise/custom all true). `src/auth/planCaps.ts` `PlanFeature` adds the 4 features + `FEATURE_MIN_PLAN` ("pro") + `PLAN_FEATURE_LABEL`; planCaps.test.ts extended.
- **C2.1 RBAC** — 5 new capabilities in `capabilities.ts`: `rate:manage`, `time:approve`, `retainer:manage`, `billing:generate`, `revenue:view`. Granted (via replaceAll of `"utilization:view",`) to every manager block in `permissions-matrix.ts` (identity + project tiers) + `ADMIN_EXTRA_CAPS` in RoleResolver.ts. `capabilityLabels.ts` labels + domains (rate/retainer→consultancy, billing/revenue→finance). permissionsMatrix.test.ts C2 suites (+10 → 68). Contributors + client get none.
- **C2.2 Time approval substrate** — migration **141** `scripts/supabase/141_rate_cards_time_approval.sql`: `rate_cards` table (rate CHECK ≥ 0, UNIQUE(project_id, profile_id, effective_from), RLS read=member / write=managers+orgadmin); `time_entries` ADD approval_status(pending/approved/rejected) default pending, approved_by, approved_at, billed default false, billed_invoice_id FK invoices, partial index unbilled. `timeQueries.ts` extended (ApprovalStatus, listTimeEntries select, approveTimeEntry RPC wrapper); c1Queries entry() factory + utilizationQueries + TimeTab updated.
- **C2.3 Retainers + RPCs** — migration **142** `scripts/supabase/142_retainers_invoice_generation.sql`: `retainers` table (monthly_amount bigint ≥ 0, status active/paused/cancelled, billing_day 1–28, RLS member-read/manager-write); `invoices` ADD source/period_from/period_to/retainer_id + indexes; 3 SECURITY DEFINER RPCs (`approve_time_entry`, `generate_hourly_invoice`, `generate_retainer_invoice`) — manager-gated, duplicate-period guard, invoice-no schemes `HRY-YYYYMM-md5` / `RTR-…`, hourly marks entries billed atomically. `financeQueries.ts` Invoice type + listInvoices now carry source/period/retainerId/phaseId.
- **C2.4 Query layer** — new `src/app/rateCardQueries.ts` (RateCard, list/upsert/delete, pure `effectiveRate`), `src/app/retainerQueries.ts` (Retainer, RETAINER_STATUSES, `RETAINER_NEXT` active↔paused / cancelled terminal, CRUD), `src/app/billingQueries.ts` (unbillableEntries, pendingApproval, unbilledSummary, unbilledByMember, billedToDate, billedBySource, retainerMrr, org-wide listOrgInvoices/listOrgRetainers, generate* RPC wrappers). `tests/app/c2Billing.test.ts` (13 tests incl. org-wide lister mocks).
- **C2.5 TimeTab approval workflow** — approve/reject/reopen via `approveTimeEntry` (gated `time:approve`), STATUS_TONE badges, billing badge, edit/delete only while pending, rate prefilled from rate cards via `effectiveRate`.
- **C2.6 BillingTab** — new `src/features/project/tabs/BillingTab.tsx` (rate cards + retainers + hourly generation + invoice list; sections self-`PlanGate` rate_cards / retainer_billing / hourly_billing; per-retainer from/to + Generate; Pause/Resume/Delete via RETAINER_NEXT). `tabs-config.ts` `billing` TabDef (`requiresAny: ["rate:manage","retainer:manage","billing:generate"]`, projectTypes consultant/design, no planFeature on the tab — sections gate internally); wired in DetailView.tsx.
- **C2.7 RevenueView** — new `src/features/org/RevenueView.tsx` at `/revenue` (lazy route), `<AccessDenied>` for `revenue:view` (no plan gate); stat cards (invoiced total / retainer MRR / hourly / phase) + per-project source-split table. Nav entry in `nav-config.ts` (`requires: "revenue:view"`, segments consultancy/architecture/multiple).
- **C2.8 i18n + comment sync** — `projTab.billing` keys added to en/hi/te.json; `66_rls_role_catalog_sync.sql` gained the comment-only C1+C2 capability↔RLS-gate map (step 4 of the capabilities.ts checklist — policies stay role-based).
- **C2.9 Tests + apply** — tabsConfig.test.ts C2 suite (+5 → 28); full verify: lint + tsc + build clean, vitest **99 files / 1293 tests**, smoke **233 checks**.
- **C2.10 Hardening (review fixes)** — migration **143** `scripts/supabase/143_consultancy_billing_hardening.sql` + frontend fixes:
  - **Gate harmonization**: C1+C2 manager gates (`fee_phases_write`, `deliverables_delete`, `review_rounds_manage`, `rate_cards_write`, `retainers_write`, and the 3 RPCs) now ALSO accept project-tier managers via `has_project_role(<project>, 'pm','project_admin','design_head','consultant_head')` — previously identity-role-only, so a project-tier manager (e.g. global `architect` assigned `pm` on a project) saw UI controls but got 42501.
  - **Invoice uniqueness**: partial unique index `uq_invoices_project_source_period` on non-cancelled generated invoices (double-click/concurrency backstop).
  - **Post-approval edit lock**: `time_entries_edit_self`/`time_entries_delete_self` now require `pending AND NOT billed` for self edits (orgadmin unchanged) — closes the direct-API hole.
  - **RPC fixes**: `approve_time_entry` nulls `approved_by` on reopen-to-pending; `generate_retainer_invoice` rejects periods before `start_date` / after `end_date`.
  - **Frontend**: `BillingTab` success toast now shows after reload (was wiped); new `src/lib/dateLocal.ts` (`localDateISO`, `currentMonthRange`) replaces UTC `toISOString()` defaults in `BillingTab`/`TimeTab`/`rateCardQueries` (IST early-morning day/month shift); TimeTab `approved` badge is now green. New `tests/lib/dateLocal.test.ts` (6).

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (5.16s) · `vitest` **99 files / 1293 tests pass** · `npm run smoke` **233 checks pass**.
- **Live DB apply**: `npm run db:apply` → **103 passed / 28 failed** (28 = the same benign pre-existing). Migrations **140** (feature caps live), **141**, **142** applied + verified via pg: 3 RPCs present with correct signatures, time_entries approval/billed columns, invoices source/period/retainer_id/phase_id, rate_cards table (0 rows).
- **Hardening (143) applied**: `npm run db:apply` → **104 passed / 28 failed** (same benign 28). Verified via pg: 7 recreated policies live, unique index `uq_invoices_project_source_period` present, all 3 RPCs contain `has_project_role`, reopen clears `approved_by`, retainer period bounds enforced. Full suite: **100 files / 1299 tests**, build 5.00s, smoke 233.

### Notes / Follow-ups
- RLS read on invoices/retainers/rate_cards is project-membership based, so org-wide rollups (utilization/revenue) only surface projects the caller is a member of — by design.
- **Manager gate**: identity roles (`pm`/`project_admin`/`design_head`/`consultant_head`) OR project-tier manager rows via `has_project_role` — matches permissions-matrix.ts. `current_role_text()` (identity) remains the base; org admin + superadmin bypass.
- **Cancel→regenerate** an hourly/retainer invoice reuses the same deterministic `no` (allowed; `no` is unconstrained, only label collisions on the cancelled row).
- Migrations 140–142 are NOT re-runnable-mutating beyond idempotent guards; keep the C1 pattern (`if not exists`, drop-policy-if-exists) for any follow-ups.
- Phase C3 candidates: per-phase utilization drill-down, deliverable file uploads (storage), invoice line items, scheduled (cron) retainer generation.



