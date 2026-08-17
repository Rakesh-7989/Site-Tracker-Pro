# SiteTrack Pro — Domain Boundary Map (VNEXT-004)

*Source of truth: `src/app/domainMap.ts`. Parity lock: `tests/app/domainMap.test.ts`
(19 tests). This doc is the human-readable view — when the registry changes, update
the tables here.*

One registry documenting **module → engine → table → capability → RLS**
boundaries, so new industry modules slot in without cross-wiring. Instead of
module ownership being scattered across `tabs-config.ts`, `plugins/catalog.ts`,
`nav-config.ts` and a dozen query files, the map is the single place that says
"what owns what".

---

## 1. The shared engines (rails)

Four shared engines exist today. Every register/ladder/form/event runs through
them (or is the next candidate to be converted).

| Engine | Implemented by (`src/app/`) | Registry entries (live) | Consumed by modules |
|--------|-----------------------------|--------------------------|---------------------|
| **workflow** — state machines (P1.1, migration 207) | `workflowEngine`, `workflowDefinitions`; consumed by `materialRequestQueries`, `qualityQueries`, `statutoryQueries`, `retainerQueries`, `consultancyAuditQueries`, `crmQueries`, `procurementQuotes`, `designWorkflowQueries` | 10 defs: `material_request`, `corrective_action`, `statutory`, `retainer`, `checklist`, `report`, `lead`, `quote`, `install`, `room_finish` | procurement, compliance, consultancy, finance, design, crm, site_ops |
| **form** — schema-driven forms (P1.2) | `formEngine`; schema declared in `consultancyAuditQueries` | `inspection-checklist` | consultancy |
| **outbox** — durable event delivery (P1.3, migration 208) | `outboxQueries`; publishers `orgBroadcastQueries`, `notificationQueries`, `financeQueries`, `procurementQuotes`, `qualityQueries` | 4 events: `org.broadcast`, `invoice.generated`, `quote.accepted`, `corrective_action.opened` | finance, procurement, site_ops, projects |
| **spatial** — site/building/floor/zone/room (P1.4, migration 206) | `spaceQueries`, `attendanceQueries` (+ hook `src/hooks/useLocationContext.ts`) | levels: `site`, `building`, `floor`, `zone`, `room` | space, people, site_ops, projects |

Rules:
- **`workflowDefinitions.ts` is the single source of truth for status ladders.**
  Query files derive their `*_NEXT` maps via `workflowNextMap` — never hand-roll a
  ladder.
- **Forms render from `defineFormSchema`.** When a new register ships a form,
  declare the schema with the engine and list it in `formEngineEntries()`.
- **Events publish through `publishEvent`/`publishOrgBroadcast`** (transactional
  outbox row), never ad-hoc `send_org_notification`. Add the new event type to
  `OutboxEventType`.
- **Location context** flows through `useLocationContext` → `spaceQueries`
  (`spatial_floors`, NOT the legacy `floors` hierarchy used only by
  `hierarchyQueries.ts`).

---

## 2. Module ownership (the slots)

Each module owns its routes (plugin catalog), its project tabs (tabs-config), its
nav items (nav-config), and a set of `src/app/*.ts` query files + DB tables.
The **routes / tabs / nav columns are derived live** from their catalogs — only
`queryFiles`, `engines`, `tables` are declared in `domainMap.ts`.

| Module | Routes (`/`) | Project tabs | Nav | Query files | Tables | Engines |
|--------|--------------|--------------|-----|-------------|--------|---------|
| **projects** (core, always on) | — | — | — | `queries`, `milestoneQueries`, `taskQueries`, `riskQueries`, `issueQueries`, `messageQueries`, `searchQueries`, `pmQueries`, `calendarQueries`, `digestQueries`, `approvalsQueries`, `projectMemberQueries`, `orgMemberQueries`, `orgAdminQueries`, `orgConfigQueries`, `orgBroadcastQueries`, `orgRegisterQueries`, `onboardingQueries`, `profileQueries`, `notificationQueries`, `notificationTemplates`, `emailTemplates` | `projects`, `project_members`, `organizations`, `milestones`, `tasks`, `updates`, `issues`, `rfis`, `change_orders`, `budgets`, `expenses`, `messages`, `notifications`, `outbox` | outbox, spatial |
| **clients** | `client`, `client/:projectId` | — | client portal | `clientPortalQueries`, `shareQueries`, `approvalQueries` | `share_links`, `handover_signatures`, `drawing_comments` | outbox |
| **site_ops** | `dpr`, `dpr/history`, `dpr/:id`, `handover`, `measurement-book` | fieldops, safety, inspections, punchlist | DPR, handover, measurement book | `siteOpsQueries`, `dprQueries`, `dprSubmit`, `dprPdf`, `dprSharingQueries`, `qualityQueries` | `dpr_messages`, `dpr_delivery_log`, `punchlist`, `inspections`, `corrective_actions`, `measurement_book` | workflow, outbox, spatial |
| **design** | `ffe`, `download-audit`, `approval-analytics` | drawings, drawing-review, ffe, moodboards, rooms | FF&E rollup, download audit, approval analytics | `drawingFileQueries`, `drawingDiffSources`, `designQueries`, `designWorkflow`, `designWorkflowQueries`, `ffeQueries`, `interiorQueries`, `approvalQueries` | `drawings`, `drawing_files`, `ffe_entries`, `design_workflow`, `interior_moodboards`, `interior_rooms` | workflow |
| **consultancy** | `utilization` | phases, time, deliverables, reviews, utilization, billing, inspection, reports | utilization | `consultancyAuditQueries`, `timeQueries`, `phaseQueries`, `deliverableQueries`, `deliverableStorageQueries`, `utilizationQueries`, `rateCardQueries`, `retainerQueries`, `billingQueries` | `fee_phases`, `time_entries`, `deliverables`, `review_rounds`, `rate_cards`, `retainers`, `inspection_checklists`, `inspection_results`, `consultancy_reports` | workflow, form |
| **finance** | `revenue`, `rabills`, `invoices`, `monthly-statement`, `org-financials` | budget, ledger, invoices, rabills, pnl, wip, budgetChange | revenue, RA bills, invoices, monthly statement, org financials | `financeQueries`, `crossInvoiceQueries`, `crossRaQueries`, `crossPoQueries`, `crossAnalyticsQueries`, `mbRaQueries`, `paymentQueries`, `projectFinancialQueries`, `receiptQueries`, `poReceiptQueries`, `forecastQueries`, `analyticsQueries`, `monthlyStatementQueries`, `monthlyStatementPdf` | `invoices`, `invoice_lines`, `payments`, `ra_bills`, `expenses`, `purchase_orders`, `po_receipts`, `inventory_transactions`, `budget_lines` | workflow, outbox |
| **procurement** | `vendors`, `procurement`, `pos`, `material-prices`, `equipment`, `vendor`, `vendor-scorecard` | materials, po, 3way | vendors, procurement, POs, material prices, equipment, vendor portal, scorecard | `procurementQuotes`, `vendorQueries`, `vendorPortalQueries`, `materialRequestQueries`, `advancedProcurementQueries`, `poReceiptQueries` | `vendors`, `procurement_quotes`, `purchase_orders`, `material_requests`, `po_receipts`, `inventory` | workflow, outbox |
| **compliance** | `compliance` | statutory, compliance | compliance | `statutoryQueries` | `statutory_approvals` | workflow |
| **people** | `worklogs`, `hierarchy` | attendance, labour | worklogs, hierarchy | `attendanceQueries`, `shiftQueries`, `siteAdminQueries`, `hierarchyQueries`, `delegationQueries` | `attendance`, `labour_register`, `shift_roster`, `org_members`, `worklogs`, `delegations` | spatial |
| **insights** | `analytics`, `forecast`, `cross-analytics` | — | analytics, forecast, cross-analytics | `analyticsQueries`, `crossAnalyticsQueries`, `forecastQueries` | — (derived) | — |
| **kiosks** | `kiosk/labour`, `kiosk/site`, `kiosk/ar`, `kiosk/snapshot` | — | kiosks | (views read through org/project query layers) | `attendance`, `dpr_messages` | — |
| **crm** | `crm` | — | pipeline | `crmQueries` | `leads`, `lead_meetings`, `lead_quotations`, `lead_agreements` | workflow |
| **research** | `research` | — | research library | `researchQueries` | `research_documents`, `research_collections`, `collection_documents` | — |
| **space** | — (substrate) | — | — | `spaceQueries` | `sites`, `buildings`, `spatial_floors`, `zones`, `rooms` | spatial |

**SaaS-shell files (not module-owned):** `CORE_FILES` in `domainMap.ts` —
platform admin/billing/usage/settings/support, signups/upgrades/staff, branding,
subdomains, feature flags, custom roles, capability overrides, audit log.

---

## 3. Gating stack (how a boundary is enforced)

Every module surface is gated by **five orthogonal layers**, all present before a
new module ships:

1. **Module** — `organizations.enabled_modules` (migration 155/161/182/206 CHECK
   admits the id) → `src/modules/registry.ts` (`MODULES` + `INDUSTRY_TEMPLATES`)
   → nav gate (`NavItem.modules`) → route gate (`ModuleGuard`) → tab gate
   (`TabDef.moduleId`).
2. **Plan** — `PlanFeature` → `planCaps.ts` + `plans.feature_caps` jsonb-merge
   migrations (each new feature ships a caps migration).
3. **Capability (RBAC)** — `src/auth/capabilities.ts` +
   `permissions-matrix.ts` (identity + project-tier) + `capabilityLabels.ts`;
   UI checks with `useCan` + `<AccessDenied>`, backend RLS enforces role checks.
4. **Segment** — `organizations.segment` (migration 134) → `NavItem.segments` /
   `TabDef.segments`.
5. **Project type** — `TabDef.projectTypes` (e.g. construction/interior vs
   consultant/design).

RSL posture by write-strength (documented per migration, verified in
`docs/PRODUCTION_RLS.md`):

| Write strength | Examples |
|----------------|----------|
| member insert/update, manager delete | `procurement_quotes`, `research_documents`, `leads` |
| any-member read, manager/orgadmin write | `inspection_checklists`, `corrective_actions`, `drawings` |
| self / project-tier manager | `time_entries` edit/delete, `po_receipts` |
| SECURITY DEFINER RPC / trigger (postgres-level) | `generate_*_invoice`, `grn_post_inventory`, `auto_open_corrective_action`, `publish_event`, outbox drain cron |

---

## 4. Adding a new module (checklist)

A new module (e.g. "Logistics") must touch **all** of these — the parity test
fails until they line up:

1. `src/modules/types.ts` + `src/modules/registry.ts` — add `ModuleId`, `MODULES`
   entry, add to the relevant `INDUSTRY_TEMPLATES`.
2. Migration — re-create the `organizations.enabled_modules` CHECK to admit the
   id (mirror 161/182), plus the module's tables/RLS/feature-caps seed.
3. `src/plugins/catalog.ts` — a plugin owning the module's routes.
4. `src/features/project/tabs-config.ts` — `TabDef.moduleId` for its tabs.
5. `src/app/nav-config.ts` — `NavItem.modules` for its nav items.
6. `src/app/domainMap.ts` — a `MODULE_SURFACES` row: `queryFiles` (new
   `src/app/*Queries.ts`), `engines` (which rails it consumes), `tables`.
7. `docs/DOMAIN_BOUNDARY_MAP.md` — add the module row to §2.
8. i18n — `module.<id>.*` labels in `en/hi/te.json` (parity enforced by
   `tests/i18n/i18n.test.ts`).

Run `tests/app/domainMap.test.ts` (19) + the full gate before committing.

---

## 5. Cross-wiring traps (what this map prevents)

- **`floors` vs `spatial_floors`** — the legacy `hierarchyQueries.ts` uses the
  old `floors` table (v3 shell hierarchy); the spatial engine uses
  `spatial_floors` (migration 206). Do NOT mix them. P1.4 fixed a real
  `from("floors")` regression in `spaceQueries.ts`.
- **No hand-rolled `*_NEXT` ladders** — derive from `workflowDefinitions` via
  `workflowNextMap`.
- **No ad-hoc notification broadcasts** — publish an outbox event instead.
- **No module writes another module's tables** — a query file serves one module
  (or `CORE_FILES`); cross-module rollups read via the owning module's query
  layer + member scope.
