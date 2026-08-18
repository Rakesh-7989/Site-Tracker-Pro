# Security Audit Register — SEC-05 (Fail-Closed Authorization Paths)

Audit date: 2026-08-19 · Scope: every client/server authz fetch that could
default-grant on missing/error data. Disposition: **fixed** (fail-closed) or
**by-design** (documented residual). Plan reference: `docs/END_TO_END_PLAN_PRINCIPAL_SDE.md` §1.2 (SEC-05) · research source: `docs/research/02_CHATGPT_SITETRACK_OVERVIEW.md` SEC-05.

## Policy Core

Every authorization decision (React hook, server plan gate, RLS policy) must
reach the SAME verdict given the same org/project/user state. Where a client
decision depends on a fetch that can fail, the decision must **deny** on any
uncertainty (`no default-true`).

## Fixed (fail-closed now)

| # | Site | Before (fail-open) | After (fail-closed) | Files |
|---|------|--------------------|----------------------|-------|
| 1 | Staff-area grants (member) | `staff_area_grants` empty OR fetch error → member saw **ALL** admin areas (`useHasStaffArea` + nav `areas.length === 0 → show`) | empty/error → `[]` → member sees **NO** admin areas; `useHasStaffArea` = `areas.includes(area)`; `nav-config` drops the `areas.length === 0` escape | `src/auth/fetchAuthSession.ts`, `src/auth/guards.tsx:178`, `src/app/nav-config.ts:234` |
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