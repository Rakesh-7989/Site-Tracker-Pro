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

import type { Capability, ProjectType, PlanFeature } from "@/auth";
import type { IconName } from "@/components/ui/icons";

export interface TabDef {
  id: string;
  label: string;
  icon: IconName;
  requires?: Capability;
  requiresAny?: ReadonlyArray<Capability>;
  projectTypes?: ReadonlyArray<ProjectType>;
  /** Plan feature that must be unlocked for this tab (omit = all plans). */
  planFeature?: PlanFeature;
}

// Project types that involve physical site execution (attendance, labour,
// safety, materials make sense here; not on pure design/consultant work).
const SITE_TYPES: ReadonlyArray<ProjectType> = ["construction", "interior"];

export const TAB_CATALOG: readonly TabDef[] = [
  // Always-on for any project member
  { id: "overview",     label: "Overview",      icon: "dashboard" },
  { id: "team",         label: "Team",          icon: "users" },

  // Progress + planning
  { id: "milestones",   label: "Milestones",    icon: "flag",      requires: "milestone:add" },
  { id: "tasks",        label: "Tasks",         icon: "check" },
  { id: "updates",      label: "Updates",       icon: "activity" },
  { id: "issues",       label: "Issues",        icon: "alert",     requires: "issue:add" },
  { id: "punchlist",    label: "Punch List",    icon: "clipboard", requires: "punchlist:add", projectTypes: SITE_TYPES },

  // Design + docs
  { id: "drawings",     label: "Drawings",      icon: "image" },
  { id: "rfi",          label: "RFIs",          icon: "msgcircle", requires: "rfi:create", planFeature: "rfi" },
  { id: "changeorders", label: "Change Orders", icon: "doc",       requires: "changeorder:create", planFeature: "approvals" },
  { id: "boq",          label: "BOQ",           icon: "barChart",  requires: "boq:edit" },
  { id: "estimate",     label: "Estimate",      icon: "wallet",    requires: "estimate:edit", planFeature: "estimate" },

  // Site execution (construction / interior only)
  { id: "fieldops",     label: "Field Ops",     icon: "hardhat",   projectTypes: SITE_TYPES, requires: "progress:edit" },
  { id: "materials",    label: "Materials",     icon: "truck",     requires: "material:add",  projectTypes: SITE_TYPES },
  { id: "attendance",   label: "Attendance",    icon: "calendar",  requires: "attendance:mark", projectTypes: SITE_TYPES },
  { id: "labour",       label: "Labour",        icon: "users",     requires: "labour:manage", projectTypes: SITE_TYPES },
  { id: "safety",       label: "Safety",        icon: "shield",    requires: "safety:report", projectTypes: SITE_TYPES },
  { id: "inspections",  label: "Inspections",   icon: "eye",       requires: "inspection:create", projectTypes: SITE_TYPES },

  // Finance (Pro+)
  { id: "budget",       label: "Budget",        icon: "barChart",  requires: "budget:view",     planFeature: "finance" },
  { id: "ledger",       label: "Ledger",        icon: "wallet",    requires: "ledger:view",     planFeature: "finance" },
  { id: "po",           label: "POs",           icon: "truck",     requires: "po:create",       planFeature: "finance" },
  { id: "invoices",     label: "Invoices",      icon: "doc",       requires: "invoice:create",  planFeature: "finance" },
  { id: "rabills",      label: "RA Bills",      icon: "wallet",    requires: "rabill:create",   planFeature: "finance" },

  // Approvals + compliance (Pro+)
  {
    id: "approvals",
    label: "Approvals",
    icon: "check",
    requiresAny: ["changeorder:approve", "rabill:approve", "po:approve"],
    planFeature: "approvals",
  },
  { id: "compliance",   label: "Compliance",    icon: "shield",    requires: "compliance:view", planFeature: "compliance_read" },

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
 */
export function visibleTabs(
  caps: ReadonlySet<Capability>,
  projectType: ProjectType,
  planCan?: (feature: PlanFeature) => boolean,
): TabDef[] {
  return TAB_CATALOG.filter(tab => {
    if (tab.projectTypes && !tab.projectTypes.includes(projectType)) return false;
    if (tab.requires && !caps.has(tab.requires)) return false;
    if (tab.requiresAny && !tab.requiresAny.some(cap => caps.has(cap))) return false;
    // Plan gate: when a predicate is supplied, hide tabs the plan doesn't unlock.
    if (tab.planFeature && planCan && !planCan(tab.planFeature)) return false;
    return true;
  });
}

/** Is a tab id valid + visible for the given caps + project type (+ optional plan)? */
export function isTabVisible(
  tabId: string,
  caps: ReadonlySet<Capability>,
  projectType: ProjectType,
  planCan?: (feature: PlanFeature) => boolean,
): boolean {
  return visibleTabs(caps, projectType, planCan).some(t => t.id === tabId);
}

/** Look up a tab definition by id (any tab, regardless of visibility). */
export function tabById(tabId: string): TabDef | undefined {
  return TAB_CATALOG.find(t => t.id === tabId);
}
