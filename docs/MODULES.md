# SiteTrack Pro — Module System (v4)

A **module** is a cohesive product area a company can switch on or off, aligned to
the "One Platform, Multiple Industry Modules" strategy. The org stores its
selection in `organizations.enabled_modules` (migration 155); the JS registry is
the single source of truth for ids, labels, icons, and the per-industry templates.

Module gating is **orthogonal** to plan gating (`<PlanGate>`) and RBAC
(`useCan`):

| Gate | Answers | Surface |
|------|---------|---------|
| Module (`useModules` / `<ModuleGate>` / `<ModuleGuard>`) | "Did this company switch on this industry module?" | Nav, routes, project tabs |
| Plan (`<PlanGate feature="...">`) | "Does their plan allow this feature?" | View-level feature caps |
| RBAC (`useCan("cap")`) | "May this user perform this action?" | Action-level capabilities |

A surface shows only if **all** applicable gates pass.

---

## The 11 modules

Source: `src/modules/registry.ts` → `MODULES`. Ids must match the migration 155
CHECK constraint (`organizations.enabled_modules`).

| id | Label | Description | alwaysOn |
|----|-------|-------------|----------|
| `projects` | Projects & Execution | Projects, teams, milestones, updates, issues, RFIs, change orders | ✅ |
| `clients` | Client Portal | Client dashboard, portal access, handover sign-off | |
| `site_ops` | Site Operations | DPRs, punch lists, submittals, permits, inspections, measurement book | |
| `design` | Design Studio | Drawing register, drawing diffs, FF&E, design review rounds | |
| `consultancy` | Consultancy Engagements | Fixed-fee phases, billable time, deliverables, reviews, utilization | |
| `finance` | Finance & Billing | Budgets, expenses, invoices, RA bills, retainers, hourly billing, revenue | |
| `procurement` | Procurement | Vendors, purchase orders, material prices, quote comparison | |
| `compliance` | Compliance & NOC | Statutory approvals / NOC register, RERA / GST / EPFO filings | |
| `people` | People & HR | Attendance, labour, worklogs, leave, org hierarchy | |
| `insights` | Analytics & Insights | Analytics, cost forecast, utilization, revenue, activity feeds | |
| `kiosks` | Kiosks & AR | Labour kiosk, site wall, AR drawing overlay, daily snapshot | |

`CORE_MODULE = "projects"` is always-on and can never be turned off.

---

## enabled_modules semantics

`organizations.enabled_modules` is a nullable `text[]` (GIN-indexed, CHECK-constrained):

| Value | Meaning |
|-------|---------|
| `NULL` | Not configured yet → **every** module enabled (back-compat with pre-module orgs) |
| `[]` | Nothing enabled (practically the core `projects` module keeps running) |
| `['a','b',…]` | Only the listed modules are enabled |

Normalization (`normalizeModules` in `registry.ts`): unknown ids dropped,
duplicates removed, empty/null → `null`. Never trust raw DB input.

---

## Per-industry templates

Source: `registry.ts` → `INDUSTRY_TEMPLATES` (order = recommended display order).

| Segment | Template |
|---------|----------|
| `construction` | projects, site_ops, people, procurement, compliance, finance, insights, kiosks |
| `architecture` | projects, design, consultancy, clients, finance, insights, compliance, procurement |
| `interior` | projects, design, site_ops, clients, finance, procurement, compliance, insights |
| `consultancy` | projects, consultancy, clients, finance, insights |
| `multiple` | all 11 |
| `NULL` (legacy) | all 11 |

Helpers: `templateModules(segment)`, `isRecommendedForSegment(segment, id)`,
`alwaysOnModules()`, `moduleById(id)`, `isModuleId(value)`.

---

## Where modules gate the UI

### 1. Sidebar nav
`NavItem.modules?: ModuleId[]` (ANY-of). `buildNav` drops items whose module is
disabled (null config → show). Applied in `src/features/shell/nav-config.ts`:
`/client`→clients, `/procurement /vendors /pos /equipment /material-prices /vendor`
→procurement, `/rabills /revenue`→finance, `/dpr /handover /measurement-book`→site_ops,
`/compliance`→compliance, `/worklogs /hierarchy`→people, `/forecast /analytics`→insights,
`/utilization`→consultancy, `/kiosk/*`→kiosks.

### 2. Routes
`src/plugins/catalog.ts` is the single source of truth for "which module owns which
route". `src/app/router.tsx` spreads `createPluginRoutes()`; every module-gated route
element is wrapped in `<ModuleGuard>` (defense-in-depth for direct URL access —
renders `<AccessDenied>` when the module is off). Add a route by adding a
`PluginRoute` to the catalog, not to the router.

### 3. Project tabs
`TabDef.moduleId` (in `src/features/project/tabs-config.ts`) maps a tab to its
module. `visibleTabs()` / `isTabVisible()` receive `moduleEnabled` and drop tabs
whose module is off; `tabModuleId(id)` resolves a tab → module for the
`<ModuleGate>` wrapper inside `DetailView.tsx`.

| Tab(s) | moduleId |
|--------|----------|
| fieldops, safety, inspections, punchlist | `site_ops` |
| drawings, ffe | `design` |
| phases, time, deliverables, reviews, utilization, billing | `consultancy` |
| budget, ledger, invoices, rabills | `finance` |
| po, materials | `procurement` |
| statutory, compliance | `compliance` |
| attendance, labour | `people` |
| overview, team, milestones, issues, messages, gantt, … (ungated) | — (always visible) |

### 4. Onboarding
Onboarding Step 1's segment picker also renders a module toggle, pre-selected
from the segment template with "Recommended" / "Always on" chips. Saving persists
`enabled_modules` via `updateOrg(…, segment, modules)`; `getMyOrg` returns it.

---

## API reference

| API | File | Purpose |
|-----|------|---------|
| `ModuleId`, `ModuleDef`, `EnabledModules` | `src/modules/types.ts` | Types (zero runtime imports, safe for auth layer) |
| `MODULES`, `moduleById`, `isModuleId`, `normalizeModules`, `isModuleEnabled`, `templateModules`, `isRecommendedForSegment`, `alwaysOnModules`, `CORE_MODULE` | `src/modules/registry.ts` | Pure catalog + helpers |
| `useModules()` → `{ enabledModules, isEnabled(id), orgId }` | `src/modules/useModules.ts` | Reactive access from active org session |
| `<ModuleGate module fallback>` | `src/modules/ModuleGate.tsx` | Inline gate (render children iff enabled) |
| `<ModuleGuard>` | `src/plugins/ModuleGuard.tsx` | Route-level gate (any module required passes) |
| `createPluginRoutes({ enabledModules? })` | `src/app/router.tsx` | Catalog → routes |
| `visibleTabs` / `isTabVisible` / `tabModuleId` | `src/features/project/tabs-config.ts` | Tab-level gating |

---

## Consistency rule

Three places must stay in sync when adding a module:

1. **Migration 155 CHECK** — allowed `ModuleId` values (`organizations.enabled_modules`).
2. **`src/modules/registry.ts`** — `ModuleId` union + `MODULES` entry (+ template if applicable).
3. **i18n** — `module.<id>.label` / `module.<id>.description` in `src/i18n/{en,hi,te}.json`
   (OnboardingView reads `t(\`module.${m.id}.label\`)`).

Tests enforcing this: `tests/modules/registry.test.ts`, nav-config + plugin catalog
parity suites (`tests/plugins/*`), and `tests/project/tabsConfig.test.ts`.

## Live DB state

Migration 155 applied live. `orgs with modules: 0` — correct until an org
completes the module-enabled onboarding flow.
