// SiteTrack Pro — module registry (v4 Phase 1).
//
// Pure, testable catalog of product modules + per-industry templates.
// The org stores its selection in organizations.enabled_modules (migration
// 155); consumers (buildNav, useModules, ModuleGate, onboarding) read this
// registry for the canonical ids / labels / icons / templates.
//
// Semantics of enabled_modules (see types.ts):
//   null  → "not configured yet" — every module is enabled (back-compat with
//           pre-module orgs).
//   []    → none enabled (practically the core 'projects' is always kept).
//   [..]  → only the listed modules are enabled.

import type { CompanySegment } from "@/auth/segmentConfig";
import type { EnabledModules, ModuleDef, ModuleId } from "./types";

export type { ModuleDef, ModuleId, EnabledModules } from "./types";

/** Ordered catalog. Display order in onboarding / module pickers. */
export const MODULES: readonly ModuleDef[] = [
  { id: "projects",     label: "Projects & Execution",  description: "Create and run projects, teams, milestones, updates, issues, RFIs and change orders.", icon: "folder",    alwaysOn: true },
  { id: "clients",      label: "Client Portal",         description: "Client dashboard, portal access and handover sign-off.", icon: "shield" },
  { id: "site_ops",     label: "Site Operations",       description: "Daily progress reports, punch lists, submittals, permits, inspections and measurement book.", icon: "hardhat" },
  { id: "design",       label: "Design Studio",         description: "Drawing register, drawing diffs, FF&E schedules and design review rounds.", icon: "image" },
  { id: "consultancy",  label: "Consultancy Engagements", description: "Fixed-fee phases, billable time, deliverables, review rounds and utilization.", icon: "trend" },
  { id: "finance",      label: "Finance & Billing",     description: "Budgets, expenses, invoices, RA bills, retainers, hourly billing and revenue.", icon: "wallet" },
  { id: "procurement",  label: "Procurement",           description: "Vendors, purchase orders, material prices and quote comparison.", icon: "truck" },
  { id: "compliance",   label: "Compliance & NOC",      description: "Statutory approvals / NOC register and RERA / GST / EPFO filings.", icon: "shield" },
  { id: "people",       label: "People & HR",           description: "Attendance, labour, worklogs, leave and the org hierarchy.", icon: "users" },
  { id: "insights",     label: "Analytics & Insights",  description: "Analytics, cost forecast, utilization, revenue and activity feeds.", icon: "barChart" },
  { id: "kiosks",       label: "Kiosks & AR",           description: "Labour kiosk, site wall, AR drawing overlay and daily snapshot.", icon: "camera" },
];

export const MODULE_IDS: readonly ModuleId[] = MODULES.map(m => m.id);

const BY_ID = new Map<ModuleId, ModuleDef>(MODULES.map(m => [m.id, m]));

/** Lookup a module definition by id. */
export function moduleById(id: ModuleId | string): ModuleDef | undefined {
  return BY_ID.get(id as ModuleId);
}

/** Type guard. */
export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && BY_ID.has(value as ModuleId);
}

/**
 * Normalize a raw enabled_modules value from the DB.
 * - Unknown ids are dropped; duplicates removed; order preserved.
 * - null / empty input → null ("not configured" = all modules enabled).
 */
export function normalizeModules(raw: unknown): EnabledModules {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set<ModuleId>();
  const out: ModuleId[] = [];
  for (const v of raw) {
    if (isModuleId(v) && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out.length ? out : null;
}

/**
 * Whether a module is enabled for an org. null enabled_modules (not yet
 * configured) → true for every module (back-compat).
 */
export function isModuleEnabled(enabled: EnabledModules, id: ModuleId): boolean {
  return enabled === null || enabled.includes(id);
}

/** The core 'projects' module — always available for every org. */
export const CORE_MODULE: ModuleId = "projects";

/**
 * Per-industry (segment) templates. Order of the arrays = recommended
 * display order in the onboarding toggle. The 'multiple' template turns
 * every module on.
 */
export const INDUSTRY_TEMPLATES: Record<CompanySegment, readonly ModuleId[]> = {
  construction: ["projects", "site_ops", "people", "procurement", "compliance", "finance", "insights", "kiosks"],
  architecture: ["projects", "design", "consultancy", "clients", "finance", "insights", "compliance", "procurement"],
  interior:     ["projects", "design", "site_ops", "clients", "finance", "procurement", "compliance", "insights"],
  consultancy:  ["projects", "consultancy", "clients", "finance", "insights"],
  multiple:     [...MODULE_IDS],
};

/**
 * Modules recommended for a segment. Unknown / legacy-null segment → every
 * module (back-compat with pre-segment orgs).
 */
export function templateModules(segment: CompanySegment | null | undefined): readonly ModuleId[] {
  if (segment && segment in INDUSTRY_TEMPLATES) return INDUSTRY_TEMPLATES[segment];
  return MODULE_IDS;
}

/**
 * Whether a module is part of an org's segment template. Used to mark
 * "recommended" toggles in onboarding.
 */
export function isRecommendedForSegment(segment: CompanySegment | null | undefined, id: ModuleId): boolean {
  return templateModules(segment).includes(id);
}

/** Modules that can NEVER be turned off (core). */
export function alwaysOnModules(): readonly ModuleId[] {
  return MODULES.filter(m => m.alwaysOn).map(m => m.id);
}
