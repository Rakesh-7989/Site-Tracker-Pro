// SiteTrack Pro — project-detail tab catalog (Phase 6, pure + testable).
//
// The legacy detail view rendered ~27 tabs gated by PERMS[role].tabs +
// project-type applicability. This is the typed, capability-driven port.
//
// Each tab declares:
//   - id / label / icon
//   - `requires`: the capability that unlocks VISIBILITY (omit = any member)
//   - `projectTypes`: which project.type values show it (omit = all)
//
// visibleTabs(caps, projectType) returns the ordered list a user sees.
// Tab CONTENT still re-checks edit capabilities with the precise context.

import type { Capability, ProjectType, PlanFeature, CompanySegment } from "@/auth";
import type { IconName } from "@/components/ui/icons";
import type { ModuleId } from "@/modules";

export interface TabDef {
  id: string;
  label: string;
  icon: IconName;
  requires?: Capability;
  requiresAny?: ReadonlyArray<Capability>;
  projectTypes?: ReadonlyArray<ProjectType>;
  /** Plan feature that must be unlocked for this tab (omit = all plans). */
  planFeature?: PlanFeature;
  /**
   * v4 company-segment gate (migration 134). When set, the tab is shown ONLY
   * to orgs whose segment is in this list. Orthogonal to `requires` — both
   * must pass. Absent = every segment. Null segment (legacy orgs) hides
   * segment-gated tabs.
   */
  segments?: ReadonlyArray<CompanySegment>;
  /**
   * v4 Phase 3: owning industry MODULE. When set, the tab is hidden unless
   * that module is enabled for the active org (organizations.enabled_modules).
   * Core 'projects' / always-on tabs leave this unset. Null org config
   * (not-yet-configured) keeps every module enabled → no regression.
   */
  moduleId?: ModuleId;
}

// Project types that involve physical site execution (attendance, labour,
// safety, materials make sense here; not on pure design/consultant work).
const SITE_TYPES: ReadonlyArray<ProjectType> = ["construction", "interior"];

// Fixed-fee consultancy engagements (v4 C1) — fee phases, billable time,
// deliverables + design review rounds apply here (not site execution).
const CONSULTANCY_TYPES: ReadonlyArray<ProjectType> = ["consultant", "design"];

export const TAB_CATALOG: readonly TabDef[] = [
  // Always-on for any project member
  { id: "overview",     label: "Overview",      icon: "dashboard" },
  { id: "team",         label: "Team",          icon: "users" },

  // Progress + planning
  { id: "milestones",   label: "Milestones",    icon: "flag",      requires: "milestone:add" },
  { id: "tasks",        label: "Tasks",         icon: "check",      requires: "update:add" },
  { id: "updates",      label: "Updates",       icon: "activity" },
  { id: "issues",       label: "Issues",        icon: "alert",     requires: "issue:add" },
  { id: "punchlist",    label: "Punch List",    icon: "clipboard", requires: "punchlist:add", projectTypes: SITE_TYPES, moduleId: "site_ops" },

  // Design + docs
  { id: "drawings",     label: "Drawings",      icon: "image", moduleId: "design" },
  { id: "rfi",          label: "RFIs",          icon: "msgcircle", requires: "rfi:create", planFeature: "rfi" },
  { id: "changeorders", label: "Change Orders", icon: "doc",       requires: "changeorder:create", planFeature: "approvals" },
  { id: "boq",          label: "BOQ",           icon: "barChart",  requires: "boq:edit" },
  { id: "estimate",     label: "Estimate",      icon: "wallet",    requires: "estimate:edit", planFeature: "estimate" },

  // Consultancy / design fixed-fee engagement (v4 C1)
  { id: "phases",       label: "Phases",        icon: "folder",     requires: "phase:manage",       projectTypes: CONSULTANCY_TYPES, planFeature: "fee_billing", moduleId: "consultancy" },
  { id: "time",         label: "Time",          icon: "calendar",   requires: "time:log",           projectTypes: CONSULTANCY_TYPES, planFeature: "time_tracking", moduleId: "consultancy" },
  { id: "deliverables", label: "Deliverables",  icon: "download",   requires: "deliverable:manage", projectTypes: CONSULTANCY_TYPES, planFeature: "deliverables", moduleId: "consultancy" },
  { id: "reviews",      label: "Reviews",       icon: "refresh",    requires: "review:comment",     projectTypes: CONSULTANCY_TYPES, planFeature: "review_rounds", moduleId: "consultancy" },
  { id: "utilization",  label: "Utilization",   icon: "barChart",   requires: "utilization:view",   projectTypes: CONSULTANCY_TYPES, planFeature: "utilization", moduleId: "consultancy" },

  // Consultancy billing (v4 C2) — sections self-plan-gate (rate_cards /
  // retainer_billing / hourly_billing) inside BillingTab.
  { id: "billing",      label: "Billing",       icon: "wallet",     requiresAny: ["rate:manage", "retainer:manage", "billing:generate"], projectTypes: CONSULTANCY_TYPES, moduleId: "consultancy" },

  // Consultancy inspection/audit (v4 Phase C) — inspection checklists + results
  // + audit reports (site visit / recommendation) for consultant/design.
  { id: "inspection",   label: "Inspection",    icon: "clipboard",  requires: "audit:manage", projectTypes: CONSULTANCY_TYPES, planFeature: "audit_reports", moduleId: "consultancy" },
  { id: "reports",      label: "Reports",       icon: "doc",        requires: "audit:manage", projectTypes: CONSULTANCY_TYPES, planFeature: "audit_reports", moduleId: "consultancy" },

  // Architecture (v4 D3) — FF&E schedule register for design/interior fit-out.
  { id: "ffe",          label: "FF&E",          icon: "hardhat",    requires: "ffe:manage", projectTypes: ["design", "interior"], planFeature: "ffe", moduleId: "design" },

  // Interior (v4 Phase B) — mood boards + rooms/installations for interior fit-out.
  { id: "moodboards",   label: "Mood Boards",   icon: "image",      requires: "ffe:manage", projectTypes: ["design", "interior"], planFeature: "ffe", moduleId: "design" },
  { id: "rooms",        label: "Rooms",         icon: "home",       requires: "ffe:manage", projectTypes: ["design", "interior"], planFeature: "ffe", moduleId: "design" },

  // Architecture (v4 D4) — statutory approvals / NOC register (design + built).
  { id: "statutory",    label: "Statutory",     icon: "shield",     requires: "statutory:manage", projectTypes: ["design", "interior", "construction"], planFeature: "statutory", moduleId: "compliance" },

  // Site execution (construction / interior only)
  { id: "fieldops",     label: "Field Ops",     icon: "hardhat",   projectTypes: SITE_TYPES, requires: "progress:edit", moduleId: "site_ops" },
  { id: "materials",    label: "Materials",     icon: "truck",     requires: "material:add",  projectTypes: SITE_TYPES, moduleId: "procurement" },
  { id: "attendance",   label: "Attendance",    icon: "calendar",  requires: "attendance:mark", projectTypes: SITE_TYPES, moduleId: "people" },
  { id: "labour",       label: "Labour",        icon: "users",     requires: "labour:manage", projectTypes: SITE_TYPES, moduleId: "people" },
  { id: "safety",       label: "Safety",        icon: "shield",    requires: "safety:report", projectTypes: SITE_TYPES, moduleId: "site_ops" },
  { id: "inspections",  label: "Inspections",   icon: "eye",       requires: "inspection:create", projectTypes: SITE_TYPES, moduleId: "site_ops" },

  // Finance (Pro+)
  { id: "budget",       label: "Budget",        icon: "barChart",  requires: "budget:view",     planFeature: "finance", moduleId: "finance" },
  { id: "ledger",       label: "Ledger",        icon: "wallet",    requires: "ledger:view",     planFeature: "finance", moduleId: "finance" },
  { id: "po",           label: "POs",           icon: "truck",     requires: "po:create",       planFeature: "finance", moduleId: "procurement" },
  { id: "3way",         label: "3-Way Match",   icon: "refresh",   requires: "po:approve",      planFeature: "finance", moduleId: "procurement" },
  { id: "invoices",     label: "Invoices",      icon: "doc",       requires: "invoice:create",  planFeature: "finance", moduleId: "finance" },
  { id: "rabills",      label: "RA Bills",      icon: "wallet",    requires: "rabill:create",   planFeature: "finance", moduleId: "finance" },

    // Approvals + compliance (Pro+)
    {
      id: "approvals",
      label: "Approvals",
      icon: "check",
      requiresAny: ["changeorder:approve", "rabill:approve", "po:approve"],
      planFeature: "approvals",
    },
    { id: "compliance",   label: "Compliance",    icon: "shield",    requires: "compliance:view", moduleId: "compliance" },

  // Always-on viewers
  { id: "map",          label: "Map",           icon: "map" },
  { id: "gantt",        label: "Gantt",         icon: "barChart",  planFeature: "gantt" },
  { id: "messages",     label: "Messages",      icon: "msgcircle" },
] as const;

export const TAB_IDS = TAB_CATALOG.map(t => t.id);

/** The default tab when none is specified in the URL. */
export const DEFAULT_TAB = "overview";

/**
 * Compute the ordered list of tabs a user sees for a project, given their
 * aggregate capability set + the project's type.
 *
 * @param caps         the user's capabilities (from capabilitiesAnywhere or
 *                     a context-scoped resolve)
 * @param projectType  the project.type
 * @param planCan      plan-unlock predicate (omit = no plan gating)
 * @param segment      the active org's company segment (migration 134)
 * @param catalog      the tab catalog to filter (defaults to TAB_CATALOG;
 *                     tests inject synthetic segment-gated tabs)
 * @param moduleEnabled  v4 Phase 3 module predicate — when supplied, tabs that
 *                     declare a moduleId are hidden unless the predicate is
 *                     true for that module. Omit / undefined → module gate off
 *                     (back-compat with pre-module callers).
 */
export function visibleTabs(
  caps: ReadonlySet<Capability>,
  projectType: ProjectType,
  planCan?: (feature: PlanFeature) => boolean,
  segment?: CompanySegment | null,
  catalog: ReadonlyArray<TabDef> = TAB_CATALOG,
  moduleEnabled?: (id: ModuleId) => boolean,
): TabDef[] {
  return catalog.filter(tab => {
    if (tab.projectTypes && !tab.projectTypes.includes(projectType)) return false;
    if (tab.requires && !caps.has(tab.requires)) return false;
    if (tab.requiresAny && !tab.requiresAny.some(cap => caps.has(cap))) return false;
    // Plan gate: when a predicate is supplied, hide tabs the plan doesn't unlock.
    if (tab.planFeature && planCan && !planCan(tab.planFeature)) return false;
    // Segment gate: when declared, the active org's segment must be in the list.
    if (tab.segments && (!segment || !tab.segments.includes(segment))) return false;
    // Module gate (v4 Phase 3): when the tab owns a module and a predicate is
    // supplied, require that module to be enabled.
    if (tab.moduleId && moduleEnabled && !moduleEnabled(tab.moduleId)) return false;
    return true;
  });
}

/** Is a tab id valid + visible for the given caps + project type (+ optional plan)? */
export function isTabVisible(
  tabId: string,
  caps: ReadonlySet<Capability>,
  projectType: ProjectType,
  planCan?: (feature: PlanFeature) => boolean,
  segment?: CompanySegment | null,
  catalog: ReadonlyArray<TabDef> = TAB_CATALOG,
  moduleEnabled?: (id: ModuleId) => boolean,
): boolean {
  return visibleTabs(caps, projectType, planCan, segment, catalog, moduleEnabled).some(t => t.id === tabId);
}

/** Look up a tab definition by id (any tab, regardless of visibility). */
export function tabById(tabId: string): TabDef | undefined {
  return TAB_CATALOG.find(t => t.id === tabId);
}

/** The owning module for a tab (undefined = core / always-on tab). */
export function tabModuleId(tabId: string): ModuleId | undefined {
  return tabById(tabId)?.moduleId;
}

/** Set of tab IDs that have real implementations (not placeholders). */
export const REAL_TABS: ReadonlySet<string> = new Set([
  "overview", "team", "milestones", "tasks", "updates", "issues", "punchlist", "drawings",
  "rfi", "changeorders", "boq", "estimate", "fieldops", "materials", "attendance", "labour",
  "safety", "inspections", "map", "boq", "gantt", "approvals", "messages",
  "phases", "time", "deliverables", "reviews", "billing",
  "ffe", "statutory", "moodboards", "rooms", "inspection", "reports",
  "po", "3way", "invoices", "budget", "rabills", "ledger", "compliance",
]);
