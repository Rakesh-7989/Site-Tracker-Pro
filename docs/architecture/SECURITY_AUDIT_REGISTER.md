# Security Audit Register — SEC-05 (Fail-Closed Authorization Paths)

Audit date: 2026-08-19 · Scope: every client/server authz fetch that could
default-grant on missing/error data. Disposition: **fixed** (fail-closed) or
**by-design** (documented residual). Plan reference: `docs/planning/END_TO_END_PLAN_PRINCIPAL_SDE.md` §1.2 (SEC-05) · research source: `docs/research/02_CHATGPT_SITETRACK_OVERVIEW.md` SEC-05.

## Policy Core

Every authorization decision (React hook, server plan gate, RLS policy) must
reach the SAME verdict given the same org/project/user state. Where a client
decision depends on a fetch that can fail, the decision must **deny** on any
uncertainty (`no default-true`).

## Fixed (fail-closed now)

| # | Site | Before (fail-open) | After (fail-closed) | Files |
|---|------|--------------------|----------------------|-------|
| 1 | Staff-area grants (member) | `staff_area_grants` empty OR fetch error → member saw **ALL** admin areas (`useHasStaffArea` + nav `areas.length === 0 → show`) | empty/error → `[]` → member sees **NO** admin areas; `useHasStaffArea` = `areas.includes(area)`; `nav-config` drops the `areas.length === 0` escape | `src/auth/fetchAuthSession.ts`, `src/auth/guards.tsx:178`, `src/app/config/nav-config.ts:234` |
| 2 | RBAC V2 enforce downgrade | `fetchRbac2Context` error → `undefined` → resolver fell back to the **matrix** in enforce mode; later refactor produced an EMPTY enforce context which ALSO fell back to matrix (`decideV2` final fallback is `matrixAllowed`) | enforce/shadow context carries `fetchError: true` on partial failure; resolver treats enforce+fetchError as **deny-all** (empty caps in `resolveCapabilities`, `can()` returns false) | `src/auth/rbac2/types.ts`, `src/auth/fetchAuthSession.ts`, `src/auth/RoleResolver.ts` |
| 3 | Plan gate UI (`usePlanCaps.can`) | `loading/unknown → true` (header: "Fail-open is deliberate") | `can()` requires positively-known caps: `!!state && hasPlanCap(...)` | `src/auth/usePlanCaps.ts` |
| 4 | `useCanWithPlan.planOk` | `planLoading → true` (transient grant) | `planLoading → false`; gate components hold a loading placeholder instead of AccessDenied-flash (`OrgRolesView`/`OrgMembersView` spinner) | `src/auth/guards.tsx:116`, `src/features/org/OrgRolesView.tsx`, `src/features/org/OrgMembersView.tsx` |
| 5 | `PlanGate` loading state | rendered **children** while plan caps load | renders a neutral "Checking … on your plan" placeholder (never children, never the upsell card) | `src/auth/PlanGate.tsx` |
| 6 | `QuotaGate` | rendered **children** while loading AND on `!rollup` (fetch error) | loading → placeholder; fetch error → "Couldn't verify usage limits" (deny) | `src/auth/QuotaGate.tsx` |
| 7 | `useFeatureWithQuota.available` | `true` while loading / no org / no client / error | `false` in every unknown state; only positively-known plan+quota passes | `src/auth/useFeatureWithQuota.ts` |
| 8 | Server `planCheck.ts` (EF backstop) | infra error / missing org / missing plan → **`allow: true`** | every unverifiable entitlement → **`allow: false`** (EFs 402 via `!planChk.allow`); `capsAllow` deny-by-default retained | `supabase/functions/_shared/planCheck.ts` |

## By-Design (documented residuals — deliberately NOT changed)

| # | Site | Behavior | Why acceptable |
|---|------|----------|----------------|
| A | `fetchCapabilityOverrides` error → `[]` | a failed override fetch drops **revokes** (org acts per base matrix) | legacy migration-69 overrides are superseded by `customRoles`/RBAC V2; server RLS is unaffected (role-based); best-effort UI surfacing only |
| B | `orgFeatureFlags.ts` unknown role → broad | platform featuresForRole catalog | NOT an authz gate — only drives admin catalog *display* (`PlatformFeatureFlagsView`); plan-based + deterministic |
| C | Module registry `enabled_modules = NULL` → all on | back-compat for pre-155 orgs | deliberate migration contract (`155_enabled_modules.sql`); UI nav/route gates read the same value |
| D | RBAC V2 **mode-read failure** → `undefined` | falls back to matrix | cannot know the org enforces; documented in `fetchRbac2Context`; server `v2_policy_check` (STABLE) is unaffected |
| E | Non-member (owner/head/superadmin-without-tier) staff-area → all | tier semantics from migration 106 | owner/head/superadmin already hold platform caps; a plain non-staff user lacks them entirely |

## Tests locking the fail-closed posture

- `tests/auth/fetchAuthSession.test.ts` — staff-area empty/error → `[]`; `fetchRbac2Context` enforce+partial-failure → `{ fetchError: true }`, happy path → no flag.
- `tests/app/navConfig.test.ts` — member with empty grants sees **no** admin routes.
- `tests/efPlanCheck.test.ts` — `capsAllow` deny-by-default; source-contract: no `return { allow: true }` anywhere; the 4 EF consumers 402 on `!planChk.allow`.
- `tests/auth/planGateFailClosed.test.tsx` — PlanGate/QuotaGate loading placeholders, quota-fetch-error deny card, `useFeatureWithQuota` fail-closed defaults.

## Residual risk (accepted, tracked)

- Server RBAC V2 (edge RPCs) is not yet wired to the same fetchError semantics — today the RLS `v2_policy_check` is the enforce gate and is unaffected by client fetch failures. If the org later ships server-side RBAC V2 enforcement outside RLS, apply the same deny-on-uncertainty rule.

---

# Security Audit Register — SEC-06/07 (Vendor Permissions + Approval SoD)

Audit date: 2026-08-19 · Scope: vendor write/read surface on `purchase_orders` +
`procurement_quotes`, and the approval trail on purchase/change orders (approver
≠ requester). Disposition: **fixed** (migration 218). Plan reference:
`docs/planning/END_TO_END_PLAN_PRINCIPAL_SDE.md` §1.3 (SEC-06/07) · research source:
`docs/research/02_CHATGPT_SITETRACK_OVERVIEW.md` SEC-06/07.

## Fixed (migration `218_po_approval_sod.sql`, applied live)

| # | Site | Before (hole) | After (fix) |
|---|------|----------------|-------------|
| 1 | Vendor PO read | `v4_vendor_read_pos` (migration 126): `is_vendor() AND is_project_member(project_id)` → vendor read **ALL** POs on any project they're a member of (over-broad; coexisted with restrictive `po_vendor_read` from 174) | policy **dropped, never re-created**; vendors read only POs on their own `vendor_id` via `po_vendor_read` (`vendors.profile_id = auth.uid()`) |
| 2 | Vendor PO insert | `v4_pos_insert` vendor branch: `is_vendor() AND is_project_member(...)` → vestigial ability for a vendor to create a PO on a project they're a member of | `v4_pos_insert` **re-created without the vendor branch** (pm-on-project OR superadmin only); vendor PO creation is not a portal surface (`po:create` for vendor = submit `procurement_quotes`) |
| 3 | Vendor quote scope | `procurement_quotes_insert` org-tier vendor branch accepted any `vendor_id` in the org | vendor branch requires `vendor_id` = their **own** vendor row (`vendors.profile_id = auth.uid()`); manager branch unchanged |
| 4 | PO approval trail | `purchase_orders` had **no** `requested_by`/`approved_by`/`approved_at` — approvals were unverifiable and SoD unenforceable (change_orders already had the trail) | 3 columns added; `requested_by` **force-stamped** to `auth.uid()` via BEFORE INSERT trigger (`trg_po_stamp_requested_by`) — spoof-proof for authenticated writers, service_role keeps explicit value |
| 5 | PO self-approval | guard `guard_approval_status_update` (migration 110) enforced SoD only for change_orders (`raised_by`) | **PO status→`approved` raises** `'requester cannot approve their own purchase order'` when `new.requested_by = auth.uid()`; change_order SoD (vs `raised_by`) kept; `approved_by := coalesce(auth.uid(), new.approved_by)` (spoof-proof id) + `approved_at := coalesce(new.approved_at, now())` on both |
| 6 | Org PO rollup trail | `org_purchase_orders(uuid)` RPC surfaced no approval fields | **recreated** with `requested_by`, `requested_by_name`, `approved_by`, `approved_by_name`, `approved_at` OUT params (DROP+CREATE — no deps; `profiles` joins) |

## Frontend (approver ≠ requester enforced in UI + approval trail surfaced)

- `src/app/queries/financeQueries.ts` — `PurchaseOrder` + `listPOs` carry
  `requestedById/requestedByName/approvedById/approvedByName/approvedAt` (embeds
  `requested:requested_by(name)` / `approved:approved_by(name)`).
- `src/features/project/tabs/POsTab.tsx` — exported `poStatusOptionsFor(po, profileId)`
  **removes the "approved" option for self-requested rows** (deny at the control
  surface; backend RLS still the gate) + `poApprovalDate(approvedAt)`; meta line
  shows `by {requester}` / `approved {approver} {date}`.
- `src/app/queries/crossPoQueries.ts` + `src/features/org/CrossProjectPOsView.tsx` — org
  rollup now shows the approval trail per PO.

## Residual risk (accepted, tracked)

- SoD applies to the status transition into `approved` only; a superadmin/org-admin
  can still approve their own PO when they are not the `requested_by` row
  (identity-based dual-role flows are allowed — the requester column is the
  enforced separator).
- `vendors` org directory read (`v3_read_vendors`) remains org-scoped — vendors can
  see the org's vendor directory (acceptable, org-scoped by design).

---

# Security Audit Register — SEC-03/08 (Multi-org Isolation + Client Portal Isolation)

Audit date: 2026-08-19 · Scope: cross-tenant org data boundaries (SEC-03) and the
client portal read surface (SEC-08). Disposition: **fixed** (migration 219 + EF
filter + RLS proof). Plan reference:
`docs/planning/END_TO_END_PLAN_PRINCIPAL_SDE.md` §1.4 (SEC-03/08) · research source:
`docs/research/02_CHATGPT_SITETRACK_OVERVIEW.md` SEC-03/08.

## Deep-dive finding: the only cross-tenant context primitive had no membership gate

- `set_tenant_context(p_org_id)` (migration 118) is SECURITY DEFINER and callable by
  ANY authenticated user; it set `app.org_id` to an arbitrary org id with **no
  membership check**. Nothing reads `app.org_id` today (grep: 118 is the only
  setter) and no edge function calls it — so there was no live exploit, but the
  primitive was unsafe for the documented "EFs set tenant context" pattern.
- EF `_shared/auth.ts` `authenticate()` fetched org memberships filtered only by
  `profile_id` — invited/removed memberships (status ≠ active, or `removed_at` set)
  would count for EF `requireOrgId`, diverging from RLS `user_org_ids()`.

## Fixed

| # | Site | Before (hole) | After (fix) |
|---|------|----------------|-------------|
| 1 | Tenant-context RPC | `set_tenant_context` accepted ANY org id from any authenticated user | **migration 219** `219_tenant_context_scope.sql`: raises `errcode 42501` unless `is_superadmin() OR p_org_id = any(user_org_ids())`; membership gate runs **before** any `set_config` (fail-closed); `app.role` still set on every call; grants `authenticated` only (anon/public revoked) |
| 2 | EF membership read | `authenticate()` org_members select filtered only by `profile_id` | adds `.eq("status", "active").is("removed_at", null)` — EF membership semantics now equal RLS `user_org_ids()` |

## Already-correct substrate (verified live, no change needed)

- `user_org_ids()` filters `status='active'` + `removed_at IS NULL`; `user_project_ids()`
  (migration 132) restricts clients to email-matched projects and pm rows to
  `removed_at IS NULL`; `can_read_project` = superadmin OR org member OR active pm.
- Client portal RLS is already bounded: drawings client rule = released-to-client +
  `current` only (`149_drawings_file_register.sql`); `read_pos`/`read_ra_bills` exclude
  `current_role_text() = 'client'`; share links token-scoped with password/OTP/expiry/
  max-views (`185`); payments via `can_read_project`.
- Client portal query layer (`clientPortalQueries.ts`) filters every read by
  `.eq("project_id", projectId)` (or `client_email` for the project list/header) and
  fails closed.

## Proof (live, rolled-back tx — `scripts/tests/test-multi-org-client-portal-rls.mjs`)

All 16 assertions green on the live DB (roles via `SET LOCAL ROLE authenticated` +
JWT sub claim):

- **ISO-001/002 (SEC-03):** an org-A admin reads org A but NOT org B's
  `organizations` row, `org_members`, `leads`, `procurement_quotes`, or `vendors`.
- **ISO-003 (SEC-03):** `set_tenant_context` membership-gated — org-A admin CAN set
  A, CANNOT set B; email-linked client cannot set any org; superadmin CAN set any.
- **CL-001..005 (SEC-08):** client sees email-matched P_A but NOT P_B; cannot read
  POs/RA bills of their own project; sees ONLY the current released-to-client
  drawing; cannot read another project's invoices/milestones; CAN read their own
  project's invoices/milestones.

## Source-contract tests (lock the posture)

- `tests/efAuthHelper.test.ts` — org_members read includes `eq:status:active` +
  `is:removed_at:null`.
- `tests/app/clientPortalDepth.test.ts` — SEC-08 block: `listClientProjects` is
  email-filtered only; `getClientProject` requires id AND email; every child-table
  read is `.eq("project_id", projectId)`.
- `tests/multiOrgIsolation.test.ts` — migration 219 source contract: raises 42501,
  gates on `user_org_ids()`/`is_superadmin()`, membership check precedes
  `set_config`, grants authenticated-only; `tenantContext.ts` fail-open behaviour
  (null org = no-op, RPC errors swallowed).

## SEC-04 — Cross-tenant attack matrix (2026-08-19)

Audit date: 2026-08-19. Scope: automated cross-tenant RLS attack matrix
(`scripts/tests/test-cross-tenant-rls.mjs`, `npm run test:rls:cross-tenant`) asserting
CT-000..CT-005 per tenant table against the LIVE DB. Disposition: **fixed**.
Plan reference: `docs/planning/END_TO_END_PLAN_PRINCIPAL_SDE.md` §1.5 (SEC-04).

### Matrix coverage

- 128 tenant-scoped tables scanned; 506 assertions (CT-000 RLS enabled, CT-001
  org B owner reads own seeded row, CT-002 org A admin CANNOT read org B row,
  CT-003/004 write/delete bounded, CT-005 org A admin INSERT claiming B scope
  rejected). **All green** (0 reds). 27 tables remain seed-skipped for FK/unique
  constraint reasons (documented in the script's skip output); the same leak
  classes on those tables were fixed in migration 222 (below).
- Live run: `SET LOCAL ROLE authenticated` + JWT claims, rolled-back tx
  (net read-only), per-assertion SAVEPOINTs, fixtures org A / org B / user C.

### Findings fixed

| Mig | Root cause | Live impact before fix | Fix |
|-----|-----------|------------------------|-----|
| **220** | `notify_payment_received` trigger read `created_by` from `invoices`/`ra_bills`, which lack the column → every insert threw (tx aborted, no delivery). Also hardened NULL-array FOREACH. | Payments never delivered notifications | trigger rewritten to source `created_by` from existing columns; NULL-safe FOREACH |
| **221** | `dpr_messages`/`dpr_delivery_log` read/insert/update policies used `org_id = (select org_id from profiles where id = auth.uid())`; `profiles` has **no** `org_id` column → correlated `org_id` resolved to the outer table → **always TRUE**. Any authenticated user could read/update every org's DPR rows and insert rows claiming any org. | CT-002/003/005 failed on dpr_messages; full cross-tenant DPR breach | policies scoped to `org_id = any(public.user_org_ids())` (active memberships, migration 173) + superadmin bypass (221) |
| **222** | Four `FOR SELECT USING (true)` read policies on org-scoped RBAC V2 tables (`org_rbac_settings`, `rbac_profile_assignments`, `vendor_project_scopes`, `digest_dispatches`/`digest_subscriptions` broken always-true pattern, plus latent `rbac_role_profiles`, `rbac_profile_bindings`, `resource_acl_entries`, `client_portal_permissions`, `buildnow_anchors`). Any authenticated user could enumerate another org's RBAC mode, profile assignments, vendor scopes, ACL entries, client permissions, and digest state. | CT-002 failed on 4 tables | all 11 read policies scoped to `user_org_ids()` + superadmin; `rbac_role_profiles`/`rbac_profile_bindings` keep platform system rows (`org_id IS NULL`) readable by all (shared metadata, same as `rbac_capabilities`) |

### Posture locked

- Frontend reads of the scoped tables are all current-org filtered
  (`fetchAuthSession.ts` `fetchRbac2Context` and `rbac2/queries.ts` read with
  `.eq("org_id", activeOrgId)`; `digestQueries.ts` org-scoped), so no client
  breakage. Superadmin bypass preserved via `role = 'superadmin'` clause.
- Gate: `RLS verifier script (removed)` confirmed 0 leaky read policies remain on the
  10 affected tables; `npm run db:apply` → 209 passed, only the 2 benign
  pre-existing failures (105/120); 220/221/222 ledgered as applied.

## SEC-05 — Project lifecycle enforcement server-side (2026-08-19)

Audit date: 2026-08-19. Scope: server-side project lifecycle enforcement
(migration 223, `npm run test:rls:lifecycle`). Disposition: **fixed**.
Plan reference: `docs/planning/END_TO_END_PLAN_PRINCIPAL_SDE.md` §1.6 (BIZ-001..004).

### Root cause

The lifecycle state machine lived ONLY in the client
(`src/lib/projectLifecycle.ts`). Status transitions and `archived_at`
archive/restore were plain PostgREST `UPDATE`s on `projects`, gated only by the
generic role-based UPDATE policies (`update_project_architect` migration 213,
`orgadmin_update_project` 03). Consequences for direct-API callers:

| # | Issue | Direct-API impact before fix |
|---|-------|------------------------------|
| BIZ-001 | illegal transitions accepted | `paused -> on_hold` / `paused -> deactivated` succeeded (client ladder skipped) |
| BIZ-002 | terminal states mutable | `completed -> paused`, `completed -> cancelled` succeeded |
| BIZ-003/004 | archive/restore not authorized in DB | any in-scope updater (architect/pm/prospector) could set/clear `archived_at`, bypassing the frontend `project:archive`/`project:restore` capability gate |

### Fix (migration `223_project_lifecycle_enforcement.sql`, applied live + ledgered)

One `BEFORE UPDATE OF status, archived_at` trigger
`trg_projects_lifecycle_guard` → `guard_project_lifecycle_transition()`:

1. **Transition legality** — mirrors `nextLifecycleOptions()` exactly:
   `active → paused/on_hold/deactivated/completed/cancelled`;
   `paused/on_hold/deactivated → active/completed/cancelled`;
   `completed/cancelled → active` only. No-op (old = new) allowed (restore
   re-sends `active`).
2. **Terminal immutability** — `completed`/`cancelled` can only reactivate to
   `active`; terminal→terminal and terminal→paused are rejected.
3. **Archive/restore authorization** — `archived_at` set/clear requires
   `is_orgadmin() OR has_org_tier(org_id,'admin') OR is_superadmin()`, mirroring
   the `project:archive`/`project:restore` capability grants (identity orgadmin,
   org-tier admin, superadmin).

Non-lifecycle column updates (rename, etc.) are untouched (trigger fires only on
`status`/`archived_at`), so `recompute_project_financials` etc. are unaffected.

### Proof (live, rolled-back tx — `scripts/tests/test-project-lifecycle-rls.mjs`)

21/21 green: legal transitions by orgadmin + pm succeed; illegal transitions
(paused→on_hold, paused→deactivated, completed→paused, completed→cancelled)
rejected; pm archive/restore rejected; orgadmin/org-tier-admin/superadmin
archive+restore allowed; pm rename unaffected. `npm run db:apply` → 210 passed,
only the 2 benign pre-existing failures (105/120); 223 ledgered as applied.

## Residual risk (accepted, tracked)

- `can_read_project` is org-wide within-org (any org member can read the org's
  project rows incl. payments) — within-org only, NOT cross-tenant; tightening to
  project-membership-only would break org-rollup views by design.
- Org-scoped tables (leads, procurement_quotes, vendors, org_members) are visible
  to any active member of the org (RLS `user_org_ids()`); delete gates are
  manager-scoped.