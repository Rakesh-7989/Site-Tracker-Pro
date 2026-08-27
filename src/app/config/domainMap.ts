// SiteTrack Pro — VNext P1.5: domain boundary map registry (VNEXT-004).
//
// One registry documenting module ↔ engine ↔ route ↔ tab ↔ query-file
// boundaries, so new industry modules slot in without cross-wiring.
//
// Two kinds of data live here:
//
//   1. DERIVED facts (read live from their sources of truth, so they can never
//      drift): moduleRoutes from the plugin catalog, moduleTabs from the tab
//      catalog, moduleNav from the nav catalog, and the engine registry
//      entries from workflowDefinitions / formEngine+consultancyAuditQueries /
//      outboxQueries / spaceQueries.
//
//   2. DECLARED boundaries (the registry that a new module must update): the
//      per-module query-file / engine / table ownership in MODULE_SURFACES and
//      the engine implementation-file lists in ENGINE_BOUNDARIES.
//
// The parity lock lives in tests/app/domainMap.test.ts: it cross-checks every
// declared boundary against the derived facts and against the real modules /
// engines / on-disk files, so a drifted declaration fails CI immediately.
//
// The human-readable companion is docs/architecture/DOMAIN_BOUNDARY_MAP.md — keep the doc's
// tables in sync with this file (the doc links back here as the source).

import type { ModuleId } from "@/modules";
import { MODULE_IDS, MODULES } from "@/modules";
import { PLUGIN_CATALOG, routeModules } from "@/plugins/catalog";
import { TAB_CATALOG } from "@/features/project/tabs-config";
import { NAV_CATALOG } from "./nav-config";
import { WORKFLOW_REGISTRY } from "../engines/workflowDefinitions";
import { checklistFormSchema, type ChecklistFormLabels } from "../queries/consultancyAuditQueries";
import { quoteFormSchema, type QuoteFormLabels } from "../queries/procurementQuotes";
import { OutboxEventType } from "../queries/outboxQueries";
import { SPATIAL_LEVELS } from "../queries/spaceQueries";

// ── 1. Engine ids ───────────────────────────────────────────────────────────
/** The shared rails a module can consume. */
export const ENGINE_IDS = ["workflow", "form", "outbox", "spatial"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export function isEngineId(v: unknown): v is EngineId {
  return typeof v === "string" && (ENGINE_IDS as readonly string[]).includes(v);
}

// ── 2. Derived accessors (live from their sources of truth) ─────────────────

/** Plugin-catalog paths owned by a module (route.gate ?? plugin owner). */
export function moduleRoutes(moduleId: ModuleId): readonly string[] {
  const out: string[] = [];
  for (const p of PLUGIN_CATALOG) {
    for (const r of p.routes) {
      if (routeModules(p, r).includes(moduleId)) out.push(r.path);
    }
  }
  return out.sort();
}

/** Project tabs owned by a module (tabs-config moduleId). */
export function moduleTabs(moduleId: ModuleId): readonly string[] {
  return TAB_CATALOG.filter(t => t.moduleId === moduleId)
    .map(t => t.id)
    .sort();
}

/** Nav items gated by a module (nav-config modules ANY-of), paths w/o leading slash. */
export function moduleNav(moduleId: ModuleId): readonly string[] {
  return NAV_CATALOG.filter(n => n.modules?.includes(moduleId))
    .map(n => n.to.replace(/^\//, ""))
    .sort();
}

/** Workflow-engine registry entries — live from workflowDefinitions. */
export function workflowEngineEntries(): readonly string[] {
  return WORKFLOW_REGISTRY.map(w => w.id);
}

/**
 * Form-engine registry entries — live from the declared schemas.
 * P1.2 shipped the inspection-checklist schema; P2.2 added the
 * procurement-quote schema. Add to this list as more registers convert to
 * defineFormSchema.
 */
const FORM_STUB_LABELS: ChecklistFormLabels = {
  fieldKind: "",
  fieldTitle: "",
  fieldStatus: "",
  titlePlaceholder: "",
  titleRequired: "",
  kindLabel: () => "",
  statusLabel: () => "",
};

const QUOTE_FORM_STUB_LABELS: QuoteFormLabels = {
  fieldVendor: "",
  fieldItem: "",
  fieldUnitPrice: "",
  fieldQty: "",
  fieldLeadDays: "",
  fieldValidUntil: "",
  fieldNotes: "",
  vendorPlaceholder: "",
  itemPlaceholder: "",
  unitPriceRequired: "",
  qtyRequired: "",
};

export function formEngineEntries(): readonly string[] {
  return [
    checklistFormSchema(FORM_STUB_LABELS, false).id,
    quoteFormSchema(QUOTE_FORM_STUB_LABELS, []).id,
  ];
}

/** Outbox-engine registry entries — live from outboxQueries (migration 208). */
export function outboxEventEntries(): readonly string[] {
  return Object.values(OutboxEventType);
}

/** Spatial-engine registry entries — live from spaceQueries (migration 206). */
export function spatialEngineEntries(): readonly string[] {
  return [...SPATIAL_LEVELS];
}

// ── 3. Module surfaces (DECLARED boundaries) ────────────────────────────────
export interface ModuleSurface {
  /** Canonical module id (must be a valid MODULE_IDS entry). */
  moduleId: ModuleId;
  /** Registry label (mirrors MODULES). */
  label: string;
  /** Project tabs owned by the module — DERIVED (do not edit here). */
  tabs: readonly string[];
  /** Plugin routes owned by the module — DERIVED (do not edit here). */
  routes: readonly string[];
  /** Nav items gated by the module — DERIVED (do not edit here). */
  nav: readonly string[];
  /** src/app/*.ts files serving the module (base names, no extension). */
  queryFiles: readonly string[];
  /** Shared engines the module consumes (must be valid ENGINE_IDS entries). */
  engines: readonly EngineId[];
  /** Primary DB tables the module owns (mirrors the migrations; documentation). */
  tables: readonly string[];
}

/** src/app files that serve the SaaS shell rather than a single product module. */
export const CORE_FILES: readonly string[] = [
  // Platform admin / operations (superadmin, cross-tenant)
  "platformAdminQueries", "platformBillingQueries", "platformUsageQueries",
  "platformSettingsQueries", "platformSupportQueries", "platformFlagQueries",
  "signupQueries", "signupAdminQueries", "upgradeQueries", "staffQueries",
  // Cross-cutting org / platform infra
  "brandingQueries", "subdomainQueries", "featureFlagQueries",
  "customRoleQueries", "capabilityOverrideQueries", "auditLogQueries",
];

/**
 * Per-module ownership. When you add a module:
 *   1. add it to src/modules/registry.ts (MODULES + a template if appropriate),
 *   2. give it plugin routes in src/plugins/catalog.ts,
 *   3. gate its tabs in src/features/project/tabs-config.ts,
 *   4. add a MODULE_SURFACES row here (queryFiles / engines / tables),
 *   5. reference it in docs/architecture/DOMAIN_BOUNDARY_MAP.md.
 * The parity test fails until 1–4 line up.
 */
export const MODULE_SURFACES: readonly ModuleSurface[] = [
  {
    moduleId: "projects",
    label: "Projects & Execution",
    tabs: moduleTabs("projects"),
    routes: moduleRoutes("projects"),
    nav: moduleNav("projects"),
    queryFiles: [
      "queries", "milestoneQueries", "taskQueries", "riskQueries",
      "issueQueries", "chatQueries", "searchQueries", "pmQueries",
      "calendarQueries", "digestQueries", "approvalsQueries",
      "projectMemberQueries", "orgMemberQueries", "orgAdminQueries",
      "orgConfigQueries", "orgBroadcastQueries", "orgRegisterQueries",
      "onboardingQueries", "profileQueries", "notificationQueries",
      "notificationTemplates", "emailTemplates",
    ],
    engines: ["outbox", "spatial"],
    tables: [
      "projects", "project_members", "organizations", "milestones", "tasks",
      "updates", "issues", "rfis", "change_orders", "budgets", "expenses",
      "messages", "notifications", "outbox", "inspection_checklists",
    ],
  },
  {
    moduleId: "clients",
    label: "Client Portal",
    tabs: moduleTabs("clients"),
    routes: moduleRoutes("clients"),
    nav: moduleNav("clients"),
    queryFiles: ["clientPortalQueries", "shareQueries", "approvalQueries"],
    engines: ["outbox"],
    tables: ["share_links", "handover_signatures", "drawing_comments", "client_portal_projects"],
  },
  {
    moduleId: "site_ops",
    label: "Site Operations",
    tabs: moduleTabs("site_ops"),
    routes: moduleRoutes("site_ops"),
    nav: moduleNav("site_ops"),
    queryFiles: [
      "siteOpsQueries", "dprQueries", "dprSubmit", "dprPdf",
      "dprSharingQueries", "qualityQueries",
    ],
    engines: ["workflow", "outbox", "spatial"],
    tables: [
      "dpr_messages", "dpr_delivery_log", "punchlist", "inspections",
      "corrective_actions", "measurement_book", "submittals", "permits",
    ],
  },
  {
    moduleId: "design",
    label: "Design Studio",
    tabs: moduleTabs("design"),
    routes: moduleRoutes("design"),
    nav: moduleNav("design"),
    queryFiles: [
      "drawingFileQueries", "drawingDiffSources", "designQueries",
      "designWorkflow", "designWorkflowQueries", "ffeQueries",
      "interiorQueries", "approvalQueries",
    ],
    engines: ["workflow"],
    tables: [
      "drawings", "drawing_files", "drawings_media", "ffe_entries",
      "design_workflow", "interior_moodboards", "interior_rooms",
    ],
  },
  {
    moduleId: "consultancy",
    label: "Consultancy Engagements",
    tabs: moduleTabs("consultancy"),
    routes: moduleRoutes("consultancy"),
    nav: moduleNav("consultancy"),
    queryFiles: [
      "consultancyAuditQueries", "timeQueries", "phaseQueries",
      "deliverableQueries", "deliverableStorageQueries", "utilizationQueries",
      "rateCardQueries", "retainerQueries", "billingQueries",
    ],
    engines: ["workflow", "form"],
    tables: [
      "fee_phases", "time_entries", "deliverables", "review_rounds",
      "rate_cards", "retainers", "inspection_checklists", "inspection_results",
      "consultancy_reports",
    ],
  },
  {
    moduleId: "finance",
    label: "Finance & Billing",
    tabs: moduleTabs("finance"),
    routes: moduleRoutes("finance"),
    nav: moduleNav("finance"),
    queryFiles: [
      "financeQueries", "crossInvoiceQueries", "crossRaQueries",
      "crossPoQueries", "crossAnalyticsQueries", "mbRaQueries",
      "paymentQueries", "projectFinancialQueries", "receiptQueries",
      "poReceiptQueries", "forecastQueries", "analyticsQueries",
      "monthlyStatementQueries", "monthlyStatementPdf",
    ],
    engines: ["workflow", "outbox"],
    tables: [
      "invoices", "invoice_lines", "payments", "ra_bills", "expenses",
      "purchase_orders", "po_receipts", "inventory_transactions",
      "budget_lines",
    ],
  },
  {
    moduleId: "procurement",
    label: "Procurement",
    tabs: moduleTabs("procurement"),
    routes: moduleRoutes("procurement"),
    nav: moduleNav("procurement"),
    queryFiles: [
      "procurementQuotes", "vendorQueries", "vendorPortalQueries",
      "materialRequestQueries", "advancedProcurementQueries", "poReceiptQueries",
    ],
    engines: ["workflow", "outbox", "form"],
    tables: [
      "vendors", "procurement_quotes", "purchase_orders", "material_requests",
      "po_receipts", "inventory",
    ],
  },
  {
    moduleId: "compliance",
    label: "Compliance & NOC",
    tabs: moduleTabs("compliance"),
    routes: moduleRoutes("compliance"),
    nav: moduleNav("compliance"),
    queryFiles: ["statutoryQueries"],
    engines: ["workflow"],
    tables: ["statutory_approvals"],
  },
  {
    moduleId: "people",
    label: "People & HR",
    tabs: moduleTabs("people"),
    routes: moduleRoutes("people"),
    nav: moduleNav("people"),
    queryFiles: [
      "attendanceQueries", "shiftQueries", "siteAdminQueries",
      "hierarchyQueries", "delegationQueries",
    ],
    engines: ["spatial"],
    tables: [
      "attendance", "labour_register", "shift_roster", "org_members",
      "worklogs", "delegations",
    ],
  },
  {
    moduleId: "insights",
    label: "Analytics & Insights",
    tabs: moduleTabs("insights"),
    routes: moduleRoutes("insights"),
    nav: moduleNav("insights"),
    queryFiles: ["analyticsQueries", "crossAnalyticsQueries", "forecastQueries"],
    engines: [],
    tables: [],
  },
  {
    moduleId: "kiosks",
    label: "Kiosks & AR",
    tabs: moduleTabs("kiosks"),
    routes: moduleRoutes("kiosks"),
    nav: moduleNav("kiosks"),
    // Kiosk views read through the org/project query layers (dpr/attendance/
    // org) — no dedicated src/app/*.ts file yet.
    queryFiles: [],
    engines: [],
    tables: ["attendance", "dpr_messages"],
  },
  {
    moduleId: "crm",
    label: "CRM & Sales",
    tabs: moduleTabs("crm"),
    routes: moduleRoutes("crm"),
    nav: moduleNav("crm"),
    queryFiles: ["crmQueries"],
    engines: ["workflow"],
    tables: ["leads", "lead_meetings", "lead_quotations", "lead_agreements"],
  },
  {
    moduleId: "research",
    label: "Research Library",
    tabs: moduleTabs("research"),
    routes: moduleRoutes("research"),
    nav: moduleNav("research"),
    queryFiles: ["researchQueries"],
    engines: [],
    tables: ["research_documents", "research_collections", "collection_documents"],
  },
  {
    moduleId: "space",
    label: "Spatial Hierarchy",
    tabs: moduleTabs("space"),
    routes: moduleRoutes("space"),
    nav: moduleNav("space"),
    queryFiles: ["spaceQueries"],
    engines: ["spatial"],
    tables: ["sites", "buildings", "spatial_floors", "zones", "rooms"],
  },
];

// ── 4. Engine boundaries ────────────────────────────────────────────────────
export interface EngineBoundary {
  id: EngineId;
  label: string;
  /** Modules that consume the engine — DERIVED from MODULE_SURFACES.engines. */
  ownedBy: readonly ModuleId[];
  /** src/app/*.ts files that implement or consume the engine (base names). */
  files: readonly string[];
  /** Registry entries the engine publishes — DERIVED from the live sources. */
  entries: readonly string[];
}

/** Modules whose surface declares the engine. */
function consumersOf(engine: EngineId): readonly ModuleId[] {
  return MODULE_SURFACES.filter(m => m.engines.includes(engine))
    .map(m => m.moduleId)
    .sort();
}

export const ENGINE_BOUNDARIES: readonly EngineBoundary[] = [
  {
    id: "workflow",
    label: "Workflow state machine (P1.1, migration 207)",
    ownedBy: consumersOf("workflow"),
    files: [
      "workflowEngine", "workflowDefinitions", "materialRequestQueries",
      "qualityQueries", "statutoryQueries", "retainerQueries",
      "consultancyAuditQueries", "crmQueries", "procurementQuotes",
      "designWorkflowQueries",
    ],
    entries: workflowEngineEntries(),
  },
  {
    id: "form",
    label: "Schema-driven forms (P1.2, P2.2)",
    ownedBy: consumersOf("form"),
    files: ["formEngine", "consultancyAuditQueries", "procurementQuotes"],
    entries: formEngineEntries(),
  },
  {
    id: "outbox",
    label: "Event outbox + delivery (P1.3, migration 208)",
    ownedBy: consumersOf("outbox"),
    files: [
      "outboxQueries", "orgBroadcastQueries", "notificationQueries",
      "financeQueries", "procurementQuotes", "qualityQueries",
    ],
    entries: outboxEventEntries(),
  },
  {
    id: "spatial",
    label: "Spatial hierarchy (P1.4, migration 206)",
    ownedBy: consumersOf("spatial"),
    files: ["spaceQueries", "attendanceQueries"],
    entries: spatialEngineEntries(),
  },
];

// ── 5. Aggregate ────────────────────────────────────────────────────────────
export const DOMAIN_MAP = {
  /** Shared engines (the rails). */
  engines: ENGINE_BOUNDARIES,
  /** Per-module ownership (the slots). */
  modules: MODULE_SURFACES,
  /** src/app files serving the SaaS shell (not module-owned). */
  coreFiles: CORE_FILES,
} as const;

/** Convenience: every module id in the registry (the canonical order). */
export const MAPPED_MODULE_IDS: readonly ModuleId[] = MODULE_IDS;

/** Look up a surface by module id. */
export function surfaceFor(moduleId: ModuleId): ModuleSurface | undefined {
  return MODULE_SURFACES.find(m => m.moduleId === moduleId);
}

/** Look up an engine boundary by id. */
export function engineBoundaryFor(engineId: EngineId): EngineBoundary | undefined {
  return ENGINE_BOUNDARIES.find(e => e.id === engineId);
}

/** The registry label for a module (mirrors src/modules/registry.ts). */
export function moduleLabel(moduleId: ModuleId): string {
  return MODULES.find(m => m.id === moduleId)?.label ?? moduleId;
}
