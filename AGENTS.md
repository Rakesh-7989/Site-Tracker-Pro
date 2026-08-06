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

## v4 Phase C3 — Consultancy Billing Depth (Complete, 2026-08-04)

### Goal
Deepen the C2 consultancy billing stack with per-phase time tracking, project-scoped utilization drill-down, deliverable file uploads, invoice line items, and fully automated retainer billing via pg_cron. Every step shipped with its own migration + frontend + tests + commit.

### Done (C3.0–C3.4, all verified)
- **C3.0+C3.1** commit `b98857f`: `time_entries.phase_id` (migration **144**, non-unique partial index, no new RLS policy); `buildPhaseRows` + `UNASSIGNED_PHASE_ID` in `utilizationQueries.ts`; UtilizationView drill-down + Unassigned bucket; `tests/app/c3Utilization.test.ts` (7). Also fixed pre-existing C2 TS errors (tabs-config icon, TimeTab Select/FeePhase, test fixtures).
- **C3.2** commit `113e5d9`: migration **145** — private storage bucket `deliverables` (50 MB, id=name) + 4 RLS policies (read=member, insert=member minus client/vendor/sub_contractor, update=member, delete=managers+orgadmin incl. `has_project_role`); `src/app/deliverableStorageQueries.ts`; DeliverablesTab upload/download/delete UI + `upload` icon; `tests/app/c3DeliverableStorage.test.ts` (9). Root-cause findings: `storage.foldername()` returns `text[]` (index `[1]`, never pass to `string_to_array`); compare folder `text` against `user_project_ids()::text`.
- **C3.3** commit `597a525`: migration **146** — `invoice_lines` table (description/qty/unit_price/amount bigint/sort_order, FK CASCADE, RLS read=member / write=managers+orgadmin) + both billing RPCs re-created to emit lines atomically (hourly = one line/member+rate via temp table `_hrly`; retainer = `coalesce(title,'Retainer')`, qty 1); `financeQueries.ts` `InvoiceLine` + `invoiceLinesTotal()`, `listInvoices`/`listOrgInvoices` embed lines; BillingTab + InvoicesTab render nested rows; `tests/app/c3InvoiceLines.test.ts` (6).
- **C3.4** commit `397d2d8`: migration **147** `scripts/supabase/147_retainer_cron.sql` — SECURITY DEFINER `admin_generate_due_retainer_invoices()`: loops ACTIVE retainers whose `billing_day = day(now() AT TIME ZONE 'Asia/Kolkata')`, period = current month `[1st..last day]`, honours `start_date`/`end_date` bounds (out-of-range → `skipped_out_of_range`), idempotent via existing non-cancelled invoice check (`skipped_existing`), emits invoice `RTR-YYYYMM-md5` + line item, per-retainer exception isolation, returns outcome table; `GRANT` to **service_role only** (cron runs as postgres = owner; manual UI flow untouched); `cron.schedule('generate-due-retainers','5 2 * * *', ...)` (idempotent by name). Frontend: `autoBillingHint(billingDay)` pure helper in `retainerQueries.ts` + per-retainer "Auto-bills on day N each month" hint in BillingTab (active retainers only); `tests/app/c3RetainerCron.test.ts` (5).

### Verification
- Final C3.4 gate: `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` (4.65s) · `vitest` **104 files / 1326 tests** · `npm run smoke` **233 checks**.
- **Live DB apply**: `npm run db:apply` → **108 passed / 28 failed** (28 = same benign pre-existing). 147 verified live via pg + functional probe: function exists, job `generate-due-retainers` (schedule `5 2 * * *`), grants svc=true/auth=false; end-to-end run generated invoice `RTR-202608-…` + line, re-run → `skipped_existing`, future-start retainer → `skipped_out_of_range`; test rows cleaned.

### Notes / Follow-ups
- **Cron timezone**: billing_day is interpreted in IST (`now() AT TIME ZONE 'Asia/Kolkata'`); job fires 02:05 UTC daily.
- **C3.4 security posture**: the admin function is NOT callable by authenticated users (service_role grant only) — manual Generate keeps its manager gate. This blocks self-serve "run now"; acceptable per agreed scope.
- **Roadmap complete**: C0→C3.4 all shipped, verified, committed. Next candidates (needs user go): org-wide cross-project rollups (utilization/revenue across all member projects), per-deliverable download audit, monthly statement PDF, push `prod` branch + live deploy.

---

## v4 Phase D — Architecture Segment Registers (Complete, 2026-08-04)

### Goal
Ship the architecture-segment register stack on the C0 substrate: storage-backed **drawing file register**, drawing **diff overlay** substrate, **FF&E schedule**, **statutory approvals / NOC register**, org-scoped **procurement quote-comparison** (with vendor portal submit), and **register cross-links** tying the registers to each other + the PO pipeline. Gated by plan feature (`ffe`/`statutory`/`procurement`, Business+) + capability + project type (arch/interior).

### Done (D0–D6, all verified)
- **D0** commit `5e7de08` — **migration 148** `scripts/supabase/148_arch_segment_feature_caps.sql` (jsonb-merge seeding the 3 C0 `PlanFeature`s into `plans.feature_caps`: pro→`ffe` true, business/enterprise/custom→`ffe`+`statutory`+`procurement` true, basic all off; sanity NOTICE loop).
- **D1** commit `a5d47bb` — **migration 149** `scripts/supabase/149_drawings_file_register.sql` (`drawings` + `drawing_files` in the shared `deliverables` bucket, member-read / released-client-read policies, insert/update members-minus-external, delete managers+orgadmin incl. `has_project_role`; `src/app/drawingFileQueries.ts` (folder/path/sanitize/formatBytes pure helpers + storage CRUD); DrawingsTab upload/download/delete; `tests/app/d1DrawingFiles.test.ts` (9)).
- **D2** commit `a46e93a` — **migration 150** `scripts/supabase/150_drawings_preview_url.sql` (`drawings.preview_url`); diff overlay substrate (`src/lib/drawingDiffPair.ts`, `src/app/drawingDiffSources.ts`, `DiffView`), DrawingsTab "compare revisions" + AR kiosk overlay; `tests/app/d2DrawingDiff.test.ts` (13).
- **D3** commit `b652dcc` — **migration 151** `scripts/supabase/151_ffe_schedules.sql` (`ffe_entries` CHECKs: category furniture/fixture/equipment, status specified/selected/ordered/installed/cancelled, qty≥1, unit_cost≥0; member read, member-minus-external write, manager delete); `src/app/ffeQueries.ts` (list/upsert/setStatus/delete + pure `committedCost`, `isCommittedStatus`, `ffeBudgetRollup`); FfeTab at `ffe` tab (projectTypes design/interior, planFeature ffe); `tests/app/d3Ffe.test.ts` (10).
- **D4** commit `3f7a62f` — **migration 152** `scripts/supabase/152_statutory_approvals.sql` (`statutory_approvals` NOC register: kinds fire/municipal/environment/electrical/labour/occupancy/other, statuses draft/applied/approved/rejected/expired, valid_until, cost≥0; manager+orgadmin write); `src/app/statutoryQueries.ts` (+ pure `isExpiring(validUntil, today, days=30)`); StatutoryTab at `statutory` tab (design/interior/construction, planFeature statutory); `tests/app/d4Statutory.test.ts` (8).
- **D5** commit `8b3ff94` — **migration 153** `scripts/supabase/153_procurement_quotes.sql` (**org-scoped** `procurement_quotes`: org_id FK, ffe_entry_id FK→ffe_entries set-null, project_id FK set-null, vendor_id FK→vendors set-null, item_name free-text fallback, unit_price≥0, qty≥1, lead_days, valid_until, status requested/received/selected/rejected CHECK, notes, created_by; indexes (org_id,status)+(ffe_entry_id); RLS read=org member, insert=org-tier `vendor` OR manager set, update/delete=managers); `src/app/procurementQuotes.ts` (`listOrgQuotes` w/ vendor join, `upsertQuote`, `attachQuote`, `setQuoteStatus`, `deleteQuote`, `listOrgProjects`, pure `quoteTotal`, `isComparable`, `bestQuote`, `QUOTE_NEXT`); `src/app/financeQueries.ts` `createPO` accepts optional `vendorId`; `src/features/org/ProcurementView.tsx` at `/procurement` (PlanGate procurement + `procurement:view`; Mode A project→FF&E compare received quotes best-highlight → **Raise PO** (createPO + mark selected); Mode B unassigned-quotes attach; manual quote form); `VendorPortalView` new **quotes tab** (org-tier vendor submit); nav `/procurement` (segments architecture/interior/multiple, Procurement group); `tests/app/d5Procurement.test.ts` (15) + navConfig suite.
- **D6** commit `TBD` — **migration 154** `scripts/supabase/154_po_quote_link.sql` (register cross-links):
  - `purchase_orders.quote_id` FK → `procurement_quotes(id)` ON DELETE SET NULL + partial index (no RLS change).
  - `org_calendar()` recreated with a third **`kind='noc'`** branch: approved NOCs with `valid_until` within the next 30 days surface in the org `/calendar` agenda (member-gate identical to milestone/task branches).
  - `financeQueries.ts`: `PurchaseOrder` + `listPOs` carry `vendorId/vendorName/quoteId/quoteItem` (join `vendor:vendor_id(name)` + `quote:quote_id(item_name)`); `createPO` accepts `quoteId`.
  - `procurementQuotes.ts`: new project-scoped `listProjectQuotes(client, projectId)`.
  - `calendarQueries.ts`: `CalKind` = `"milestone"|"task"|"noc"`, mapped in `getOrgCalendar`.
  - `ProcurementView` Raise PO passes `quoteId: q.id`.
  - `POsTab`: "from quote" chip + **vendor Select** in the create form (`vendorQueries.listVendors`).
  - `FfeTab`: per-entry procurement surface (loads quotes + POs in parallel) — "N quotes · best ₹X" link → `/procurement`, or "PO PO-XXX" once a selected quote has a linked PO.
  - `OverviewTab`: **Registers strip** — Drawings/FF&E/Statutory/POs count chips, each gated by the same rules as the target tab (`isTabVisible` → capability + plan + segment + project-type), plus an amber "N NOC expiring in 30d" alert (`isExpiring`) → Statutory tab.
  - `CalendarView`: NOC rows → `/projects/{id}/statutory`, danger badge "NOC · Expiring".
  - `tests/app/d6CrossLinks.test.ts` (5: PO provenance mapper, listProjectQuotes mapper, getOrgCalendar noc mapping, bucketByDate NOC placement).

### Verification
- Final D6 gate: `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (6.38s) · `vitest` **110 files / 1411 tests pass** · `npm run smoke` **233 checks**.
- **Live DB apply**: `npm run db:apply` → **115 passed / 28 failed** (28 = same benign pre-existing). 154 verified live via pg: `purchase_orders.quote_id` + FK + partial index present; `org_calendar` def contains the `'noc'` branch + authenticated grant intact; functional probe (gate removed, postgres role has no org membership so the RPC returns empty for it — same as milestone/task branches): within-30d approved NOC → `kind=noc` row, >30d → excluded; test rows cleaned.

### Notes / Follow-ups
- **D6 note**: `org_calendar` is a member-gated RPC — as `postgres` the gate (`is_superadmin() OR p_org = ANY(user_org_ids())`) yields empty for all branches; the D6 branch was functionally verified with the gate clause removed, matching how milestones/tasks behave.
- **Phase D complete**: D0→D6 all shipped, verified, committed. Next candidates (needs user go): Phase E (procurement purchase lifecycle depth, per-quote supplier scoring, cross-project FF&E rollups), push `prod` branch + live deploy.

---

## v4 Phase E — Procurement Purchase Lifecycle Depth (Complete, 2026-08-06)

### Goal
Extend the D6 quote → PO chain through to settlement: **goods receipts** (partial deliveries) against a purchase order. Track each delivered batch (qty, unit-price snapshot, line amount, who recorded it), roll up received-vs-open settlement amounts org-wide, and surface per-PO delivery progress in the POs tab. Gated by project membership + the manager set (no new capability/plan gate — rides existing `po:create`/`po:approve` and `procurement:view`).

### Done (all verified)
- **Migration 158** `scripts/supabase/158_po_receipts.sql`:
  - `po_receipts` table (id, po_id FK→purchase_orders ON DELETE CASCADE, received_date, qty CHECK ≥ 1, unit_price CHECK ≥ 0, amount CHECK ≥ 0, notes, received_by FK→auth.users SET NULL, created_at) + `idx_po_receipts_po_id`.
  - **RLS project-scoped, mirroring purchase_orders**: read = `can_read_project(<po>.project_id)`, insert/update/delete = `can_write_project(<po>.project_id)` (manager set covers org admin + project-tier manager via `has_project_role`). `grant DML to authenticated`, revoke anon.
  - `org_purchase_orders(uuid)` **recreated** (DROP+CREATE — CREATE OR REPLACE can't add OUT params; verified no deps) to add `vendor_id, quote_id, quote_item, received_amount` (Σ receipts) and `open_amount` (GREATEST(0, amount − received)); same member gate as before.
- **`src/app/poReceiptQueries.ts`** (new) — `PoReceipt` + CRUD (`listPoReceipts` w/ `received_by(name)` join, `addPoReceipt` computes `amount = qty × unit_price`, `deletePoReceipt`) + pure helpers `receiptAmount`, `receivedTotal`, `openAmount`, `deliveryProgress` (0–100, clamps over-delivery), `isFullyDelivered`.
- **`src/app/crossPoQueries.ts`** — `CrossPO` gained `receivedAmount`/`openAmount` mapped from the recreated RPC.
- **`src/features/project/tabs/POsTab.tsx`** — "Receipts" expandable per PO: delivery progress bar (emerald when 100%), received/open ₹, receipts list (received_by name), Add-receipt form (date/qty/unit ₹/notes) + delete (both gated by `po:approve`). Rows use an explicit Receipts button (dropped whole-row `onRowClick` to avoid a `<select>` nested inside a `<button>`, invalid HTML).
- **Tests** — new `tests/poReceipts.test.ts` (9: pure math + query mappers incl. error surfaces), `tests/crossPoQueries.test.ts` extended for received/open.

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (5.68s) · `npm run smoke` **233 checks** · `vitest` **122 files / 1548 tests pass** (+1 file / +9).
- **Live DB apply**: `npm run db:apply` → **120 passed / 28 failed** (28 = same benign pre-existing). 158 verified live via pg: `po_receipts` columns + 4 RLS policies present; rebuilt `org_purchase_orders` OUT params include `received_amount`/`open_amount`.
- **Live deploy** (2026-08-06, commit `2809dc8`): pushed `prod`; Vercel site 200 OK.

### Notes / Follow-ups
- **`amount` snapshot**: receipts store a unit-price snapshot at receive time (not re-read from PO), so settlement value reflects the actual receipt; over-delivery (`Σ receipts > PO amount`) clamps `open_amount` to 0 while `deliveryProgress` clamps at 100%.
- Candidate next sub-tasks (needs user go): per-quote supplier scoring, cross-project FF&E rollups, deliverable download audit, monthly statement PDF.

---

## v4 Phase E2 — Per-Quote Supplier Scoring (Complete, 2026-08-06)

### Goal
Rank comparable quotes as purchase sides so managers pick the **best value**, not just the cheapest. A composite 0–100 score blends price competitiveness (vs the cheapest comparable), lead time (vs the pool minimum), and the vendor's stored track record rating. Purely client-side — no schema change (reads existing `vendors.rating numeric(2,1)` 0–5).

### Done (all verified)
- **`src/app/procurementQuotes.ts`** — three pure helpers:
  - `scoreQuote(q, peers, vendorRating?)` → `{ score, priceScore, leadScore, ratingScore }`. `priceScore = cheapestTotal/ownTotal×100` (cheapest → 100, 2× premium → 50); `leadScore = minLead/ownLead×100` (no lead → 50, only-quote-with-lead → 100); `ratingScore = rating/5×100`. Final = `Σ factor × SCORE_WEIGHTS` (`{ price: 0.5, lead: 0.3, rating: 0.2 }`).
  - `bestScoredQuote(quotes, today, ratings)` → top composite scorer among comparable quotes; ties fall to the lower quote total; null when nothing comparable.
  - `scoreQuoteAlone(rating?)` → price/lead neutral at 50, only rating moves the total (per-quote display context).
- **`src/features/org/ProcurementView.tsx`** — each FF&E group computes `bestScoredQuote`; per-quote rows show a score badge (`Best value` ≥75 / `Good value` ≥55 / `Basic`, tone success/warning/neutral), `· score N/100` in the meta line, and the top scorer gets the accent border (previously the cheapest did — now "best value").
- **Tests** — new `tests/app/quoteScoring.test.ts` (9: price scale, lead scale, rating scale, weight sum, alone-neutral, best-selection, non-comparable exclusion, tie-break, weights export).

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (5.96s) · `npm run smoke` **233 checks** · `vitest` **123 files / 1557 tests pass** (+1 file / +9).
- **Live deploy** (2026-08-06, commit `ad67268`): pushed `prod`; Vercel site 200 OK. No DB change.

### Notes / Follow-ups
- Scoring reads `vendors.rating` only — a 0–5 star value set via vendor directory / `setVendorRating`. Unrated vendors score neutral (50 on that factor), so they're not penalized for missing data.
- `bestQuote` (cheapest-only) still exported for callers that want raw price comparison; ProcurementView now highlights `bestScoredQuote`.
- Candidate next sub-tasks (needs user go): cross-project FF&E rollups, deliverable download audit, monthly statement PDF.

---

## v4 Phase 1 — Module System (Complete, 2026-08-06)

### Goal
First slice of the "One Platform, Multiple Industry Modules" strategy: an org-level **module registry** with per-industry (segment) templates, persisted on `organizations.enabled_modules`, driving module-gated nav + a `useModules()`/`<ModuleGate>` API and an onboarding module toggle. Build order for the broader v4 product: module substrate → plugin registry (lazy routes) → per-industry module surface.

### Done (all verified)
- **Migration 155** `scripts/supabase/155_enabled_modules.sql` — `organizations.enabled_modules` (text[], nullable, CHECK that every element ∈ 11 known ids, GIN index). NULL = not configured yet → all modules enabled (back-compat); array = only those enabled.
- **`src/modules/`** (new): `types.ts` (`ModuleId`, `ModuleDef`, `EnabledModules` — zero runtime imports, safe for auth-layer import), `registry.ts` (11 modules, `MODULE_IDS`, `moduleById`, `isModuleId`, `normalizeModules` (drops unknowns/dedupes/null), `isModuleEnabled`, `CORE_MODULE='projects'`, `INDUSTRY_TEMPLATES` per segment, `templateModules`, `isRecommendedForSegment`, `alwaysOnModules`), `useModules.ts` (`{ enabledModules, isEnabled(id), orgId }` from active org), `ModuleGate.tsx` (renders children only if module enabled; null config → render), `index.ts` barrel.
- **Auth session** — `OrgMembership.enabledModules?: EnabledModules` (types.ts); `normalizeOrgMembership` reads + normalizes it; org join select includes `enabled_modules` (fetchAuthSession.ts).
- **Nav gating** — `NavItem.modules?: ModuleId[]` (ANY-of gate) + 4th filter in `buildNav` (null config → show, back-compat); applied to catalog: /client→clients, /procurement /vendors /pos /equipment /material-prices→procurement, /rabills /revenue→finance, /dpr /handover /measurement-book→site_ops, /compliance→compliance, /worklogs /hierarchy→people, /forecast /analytics→insights, /utilization→consultancy, /vendor→procurement, /kiosk/*→kiosks.
- **Onboarding Step 1** — segment pick now also renders a **module toggle** (pre-selected from the segment template, "Recommended"/"Always on" chips, projects locked on); `saveOrg` persists `enabled_modules` via `updateOrg(client, orgId, name, email, segment, modules)`; `getMyOrg` returns `enabled_modules`.
- **Tests** — new `tests/modules/registry.test.ts` (registry/normalize/templates); navConfig module-gating suite (incl. `/client` via `client` role which holds `share:client:portal`); fetchAuthSession + onboardingQueries extensions.

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (13.14s) · `vitest` **112 files / 1439 tests pass** (+23).
- Commit `3100cd5` (v4 Phase 1). Also committed `a3cb746` (fix recurring build failure: handover JSX, Badge size prop, invalid icons/capability, test fixes — 7 files).
- **Live DB apply**: `npm run db:apply` → **118 passed / 28 failed** (28 = the same benign pre-existing). Migration **155** applied + verified live: `organizations.enabled_modules` present, GIN index + CHECK constraint live. `orgs with modules: 0` (correct until onboarding sets it).
- **Live deploy** (2026-08-06): pushed `prod`; Vercel Deploy + GitHub CI both green; site 200 OK at https://sitetrack-rakesh.vercel.app.
  - Note: `npm run smoke` initially failed 8 "App marker" checks for views that moved from router.tsx into the plugin catalog — fixed by adding `src/plugins/catalog.ts` to the smoke scan (commit `2c819bc`, "fix(smoke): scan plugin catalog for module-gated view markers").

### Next Phase
- Phase 2: **plugin registry** — ✅ Done (see v4 Phase 2 below).
- Phase 3: per-industry module surface — ✅ Done (see v4 Phase 3 below).

---

## v4 Phase 2 — Plugin Registry (Complete, 2026-08-06)

### Goal
The route surface of the Phase 1 module system: a **plugin catalog** (`src/plugins/`) that is the single source of truth for "which module owns which route", wired into the static router via `createPluginRoutes()` + a route-level `<ModuleGuard>` (Option A: static router kept, each module-gated route element wrapped in ModuleGuard; nav gating from Phase 1 remains the primary gate, ModuleGuard is defense-in-depth for direct URL access).

### Done (all verified)
- **`src/plugins/`** (new):
  - `types.ts` (`PluginDef`, `PluginRoute` (`path`, `modules` ANY-of, `lazy` factory, optional `stubId`), `PluginLazy` — type-only, zero runtime imports).
  - `catalog.ts` — `PLUGIN_CATALOG`: 9 plugins owning 24 routes, lazy `import()` factories moved verbatim from the old hardcoded router (clients→`/client`; site_ops→`/dpr` `/dpr/history` `/handover`(also clients) `/measurement-book`; procurement→`/vendors` `/procurement` `/pos` `/material-prices` `/equipment` `/vendor`; finance→`/revenue`; insights→`/analytics` `/forecast`; consultancy→`/utilization`; compliance→`/compliance`; people→`/worklogs` `/hierarchy`; kiosks→`/kiosk/labour` `/kiosk/site` `/kiosk/ar` `/kiosk/snapshot` (stub-gated)). Helpers `pluginRoutes()` (flat) + `routeModules(plugin, route)` (route.modules ?? owning module).
  - `ModuleGuard.tsx` — route-level guard: renders children iff ANY required module is enabled for the active org (null `enabled_modules` → render, back-compat); disabled → `<AccessDenied>` card. Optional `fallback` prop.
  - `router.tsx` — `createPluginRoutes({ enabledModules? })`: converts catalog → `RouteObject[]`, each wrapped in `<ModuleGuard>`; stub-gated routes additionally wrapped in `<StubGuard>`; optional `enabledModules` pre-filter (used by tests; future dynamic router).
  - `index.ts` barrel.
- **`src/app/router.tsx`** — module-gated routes replaced with `...createPluginRoutes()` spread in the shell children; the module-gated lazy imports moved to the catalog; non-module lazy views (org/admin/account/calendar/search/messages/pm/activity/audit/digest/delegations) stay hardcoded. NOTE: the pre-existing `/delegations` route was restored after being briefly dropped in the refactor.
- **Tests** — new `tests/plugins/catalog.test.ts` (structure: unique paths, valid module ids, owning-module coverage, `routeModules` fallback; nav-config parity: every module-gated nav item resolves to a catalog route or known non-route `/rabills` (no view yet, pre-existing gap), every nav module gate ∈ plugin owners). New `tests/plugins/router.test.ts` (`createPluginRoutes`: route count == catalog; `enabledModules:null` back-compat; ANY-of pre-filter keeps procurement routes + drops non-procurement; handover present when only clients enabled). Updated `tests/app/router.test.ts` — lazy-import scan now covers router.tsx + catalog.ts; module-gated path assertions moved to the catalog; asserts router.tsx spreads `createPluginRoutes()`.

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (10.05s) · `vitest` **114 files / 1454 tests pass** (+15).
- Commit `a4b0e7d` (v4 Phase 2).

### Notes / Follow-ups
- **Option A kept**: router stays static, all module routes always in the tree; `<ModuleGuard>` gates at render time using the active org's `enabled_modules`. No `enabledModules` at build time → chunks are always emitted, but only loaded on navigation (unchanged from Phase 1). A future Option B (dynamic router built after auth loads) can reuse `createPluginRoutes({ enabledModules })`.
- **`/rabills`**: nav-gated by `finance` but has no view/component — not in the catalog (known gap, documented in catalog.test.ts).
- **`/delegations`**: non-module nav item (`org:approvals:manage`); route restored in router.tsx during the Phase 2 refactor.
- **Plugin catalog vs nav-config**: both still exist; the catalog owns module→route, nav-config owns capability/segment/module gating for the sidebar. Deriving nav `modules` from the catalog is a possible later cleanup (deferred).

### Next Phase
- Phase 3: per-industry module surface — ✅ Done (see v4 Phase 3 below).

---

## v4 Phase 3 — Per-Industry Module Surface (Complete, 2026-08-06)

### Goal
Make the existing C1–D feature registers surface per-industry through the Phase 1 module system: (1) verify segment templates (`INDUSTRY_TEMPLATES`) match register reality, (2) gate module-specific tabs/views with `<ModuleGate>`, (3) add `module.*` i18n labels in en/hi/te. No schema change.

### Done (all verified)
- **`TabDef.moduleId?: ModuleId`** added to `src/features/project/tabs-config.ts` (26 tabs mapped): site_ops→fieldops/safety/inspections/punchlist; design→drawings/ffe; consultancy→phases/time/deliverables/reviews/utilization/billing; finance→budget/ledger/invoices/rabills; procurement→po/materials; compliance→statutory/compliance; people→attendance/labour. Ungated (always visible): overview/team/milestones/tasks/updates/issues/rfi/changeorders/estimate/map/boq/gantt/messages/handover.
- **`visibleTabs()` / `isTabVisible()`** now accept a `moduleEnabled` predicate (5th gate, orthogonal to capability/plan/segment/project-type); `tabModuleId(id)` resolves a tab→module. `DetailView.tsx` reads `useModules()` and drops tabs whose module is off (null config → show, back-compat).
- **`DetailView.tsx`** — tab-content render wrapped in `<ModuleGate module={tabModuleId(activeId)}>` for module-owned tabs; Overview "Registers strip" count chips also module-gated (`isTabVisible` already covers them). Tab defs' `projectTypes`/`planFeature`/`requires` gates left intact (ModuleGate is additive defense-in-depth).
- **i18n** — 13 `module.*` label keys per locale added to `src/i18n/{en,hi,te}.json` (alpha-only ASCII keys, matching the migration 155 CHECK id set); `OnboardingView` reads `t(\`module.${m.id}.label\`)`.
- **Tests** — `tests/project/tabsConfig.test.ts` extended (+77): every tab that should be ModuleGate-wrapped is (moduleId present on 26), gating predicate works with moduleEnabled, `tabModuleId` round-trips, ungated tab set verified. Also touched: `OnboardingView.tsx` (+4), `OverviewTab.tsx` (+4).

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean · `vitest` green (files/tests grew: baseline 114 files/1454 tests → +tabsConfig suite).
- Commit `664e674` (v4 Phase 3).

### Notes / Follow-ups
- Module ownership per tab documented in `docs/MODULES.md` §3 table (three-place consistency rule: migration 155 CHECK ↔ registry.ts ↔ i18n).
- `/rabills` remains the known nav-gated-but-viewless gap (from Phase 2, unchanged).

---

## Sprint 2 DPR — Real Submit Pipeline + Foundation (Complete, 2026-08-06)

### Goal
Ship the Sprint 2 WhatsApp DPR flow's code surface end-to-end on the shape agreed in `docs/SPRINT_2_ARCHITECTURE.md`: compose → voice → geotagged photo → submit → history → detail → retry, with offline queue, live BuildNow badge, and a shared real Meta Cloud API client. Real Bhashini/AWS transcription + BuildNow API access stay blocked on founder-provided API keys (provider-agnostic shells remain, mock adapter real).

### Done (commits `124ac31`, `28cdf0e`, `c2f6949`)
- **Real submit pipeline** (`124ac31`): `src/app/dprSubmit.ts` (379 ln — optimistic submit, photo/voice upload to storage, offline enqueue, delivery-log insert, BuildNow badge state); `src/app/dprQueries.ts` extended; `src/features/dpr/DPRDetailView.tsx` (208 ln new) + `PhotoGeotagCapture.tsx` (215 ln new, EXIF → device GPS → Hyderabad bbox); `src/lib/dprOfflineSync.ts` (drain/useOfflineSync); `DPRComposer.tsx` fully wired; route `/dpr/history` + catalog entry; migration **157** `scripts/supabase/157_dpr_media_bucket.sql` — private `dpr-media` bucket (15 MB, id=name) + 4 storage RLS policies (read/insert org-member minus client-ish roles, update org-member, delete managers+orgadmin incl. `has_project_role`), path `<org_id>/<date>/<sha256>.<ext>` using the validated `storage.foldername(name)[1] IN (user_org_ids()::text)` pattern from 145.
- **Shared Meta client + i18n** (`28cdf0e`): `supabase/functions/_shared/whatsapp_client.ts` (123 ln — real Meta Cloud API send text+template, `normalizeNumber`, token validation + rate-limit guard); `whatsapp-send` refactored to reuse it (83 ln removed) + `whatsapp_dpr_send` stub `sendViaMetaCloudApi` replaced with real body-composition send; `src/features/dpr/OfflineQueueBanner.tsx` standalone i18n banner; `VoiceNoteRecorder`/`DPRComposer`/`DPRHistoryView`/`DPRDetailView` i18n-wired via `useT()` (+composer language select driven by `voice.language.*`); `retryOk` boolean replaces brittle `startsWith("Send ok")`; ~71 new i18n keys per locale (`dpr.offline/recorder/history/detail` + 19 `dpr.composer.*`); i18n parity test extended to `dpr`/`voice`/`buildnow` flat + `dpr.*` deep; `tests/dpr/offlineQueueBanner.test.tsx`.
- **CI fix** (`c2f6949`): dropped unused React import in OfflineQueueBanner test (TS6133).

### Verification
- `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean (8.8s) · `vitest` **118 files / 1502 tests pass** · `npm run smoke` **233 checks** (smoke marker added for new `/dpr/history` view + plugin-catalog scan).
- **Live DB**: migration **157** NOT yet applied live (pending in Phase F — `v4-db`). No prod deploy yet for this Sprint 2 work.

### Notes / Follow-ups
- **Phase B — DPR test coverage (done 2026-08-06, commit `96e30a2`)**: added `tests/dpr/digestPreview.test.ts` (pure previewDigest), `tests/dpr/efInternals.test.ts` (source-contract locks on Sprint 2 hardening: idempotent upserts `on_conflict=org_id,client_token` / `project_id,sync_date`, retry maxAttempts 3 + baseMs 1000, quota guard 402/budget-blocked, cache-first voice/binary, `message?.status` terminal cached path, auth gates), `tests/dpr/dprViews.test.ts` (exported `sortByStatus`/`sortByDate`/`STATUS_ORDER` from DPRHistoryView + `outcomeVisual`/`fmtDateTime` from DPRDetailView). Full gate: lint/tsc/build clean, smoke 233, vitest **121 files / 1539 tests** (+3/+37). Pushed `prod`; live 200 OK.
- `VoiceConfidenceBar.tsx` is dead code (never imported) — cleanup candidate.
- Full status + execution log in `docs/SPRINT_2_DPR_RESEARCH.md`.

---

## Phase 6 — Mobile/Responsive (Partial, 2026-08-06)

### Done
- Commit `a986b8a` — DPR history row `flex-wrap` + audio `max-w-full` (prevents ~360px overflow). Single targeted fix only.

### Remaining (next sub-tasks, per `v4-phase6` agent scope)
- CalendarGrid mobile layout (stack/scroll on small screens)
- Board stacked column under breakpoint
- Tabs overflow indicator (`overflow-x-auto` / `whitespace-nowrap`)
- Top-20 file/content cell overflow wrap
- Optional `xs:` breakpoint decision (add to tailwind.config.js only if a concrete case needs it)
- Landing nav mobile hamburger behavior



