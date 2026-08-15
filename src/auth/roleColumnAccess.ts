// SiteTrack Pro — Role-based column access checkers.
// Pure helpers (no runtime DB queries) that map identity/project roles to
// column-level visibility. Used by UI components via `useCanColumn` or
// direct imports for server-side rendering / SSG.

import { isIdentityRole, isProjectTierRole } from "./roles";
import { identityCapabilities, projectTierCapabilities } from "./permissions-matrix";
import { CAPABILITIES } from "./capabilities";
import type { Capability } from "./capabilities";

/** All identity roles that have `budget:view` capability (can see budget columns). */
export const BUDGET_VIEW_ROLES: Set<string> = new Set([
  "orgadmin",
  "pm",
  "project_admin",
  "promoter",
  "design_head",
  "consultant_head",
  "designer",
  "consultant",
  "mep_consultant",
  "structural_consultant",
]);

/** All identity roles that can see `mrr` / financial rollup columns. */
export const FINANCIAL_ROLLUP_ROLES: Set<string> = new Set([
  "orgadmin",
  "pm",
  "project_admin",
  "promoter",
  "design_head",
  "consultant_head",
  "consultant",
]);

/** All identity roles that can see `project_id` in rollup contexts. */
export const PROJECT_SCOPE_ROLES: Set<string> = new Set([
  "orgadmin",
  "pm",
  "project_admin",
  ...Array.from(BUDGET_VIEW_ROLES).filter(
    (r) => r !== "client" && r !== "site_inspector"
  ),
]);

/** Check if an identity role can read budget-related columns. */
export function canViewBudget(role: string): boolean {
  return BUDGET_VIEW_ROLES.has(role);
}

/** Check if an identity role can see financial rollup columns. */
export function canViewFinancialRollup(role: string): boolean {
  return FINANCIAL_ROLLUP_ROLES.has(role);
}

/** Check if an identity role can see project-scoped data in rollup views. */
export function canViewProjectScope(role: string): boolean {
  return PROJECT_SCOPE_ROLES.has(role);
}

/** Check if an identity role has the `crm:view` capability. */
export function canViewCrm(role: string): boolean {
  const caps = identityCapabilities(role as const);
  return caps.includes("crm:view");
}

/** Check if an identity role has the `utilization:view` capability. */
export function canViewUtilization(role: string): boolean {
  const caps = identityCapabilities(role as const);
  return caps.includes("utilization:view");
}

/** Check if an identity role has the `ffe:manage` capability. */
export function canManageFFE(role: string): boolean {
  const caps = identityCapabilities(role as const);
  return caps.includes("ffe:manage");
}

/** Check if an identity role has the `statutory:manage` capability. */
export function canManageStatutory(role: string): boolean {
  const caps = identityCapabilities(role as const);
  return caps.includes("statutory:manage");
}

/** Check if an identity role has the `audit:manage` capability. */
export function canManageAudit(role: string): boolean {
  const caps = identityCapabilities(role as const);
  return caps.includes("audit:manage");
}

/** Check if an identity role has the `crm:manage` capability. */
export function canManageCrm(role: string): boolean {
  const caps = identityCapabilities(role as const);
  return caps.includes("crm:manage");
}

/** Check if an identity role has the `deliverable:manage` capability. */
export function canManageDeliverable(role: string): boolean {
  const caps = identityCapabilities(role as const);
  return caps.includes("deliverable:manage");
}

/** Check if an identity role can see `project_name` / `project_id` in rollup contexts. */
export function canViewProjectId(role: string): boolean {
  return PROJECT_SCOPE_ROLES.has(role);
}

/** Check if a project-tier role can see deliverable management columns. */
export function projectTierCanManageDeliverable(role: string): boolean {
  return projectTierCapabilities(role as const).includes("deliverable:manage");
}

/** Check if a project-tier role can see utilization view columns. */
export function projectTierCanViewUtilization(role: string): boolean {
  return projectTierCapabilities(role as const).includes("utilization:view");
}

/** Check if a project-tier role can see budget view columns. */
export function projectTierCanViewBudget(role: string): boolean {
  return projectTierCapabilities(role as const).some(
    (cap) => cap.startsWith("budget:")
  );
}

/** Get all capabilities for an identity role. */
export function getIdentityCapabilities(role: string): Capability[] {
  // Validate the role is an identity role
  if (!isIdentityRole(role)) {
    return [];
  }
  return identityCapabilities(role as const);
}

/** Get all capabilities for a project-tier role. */
export function getProjectTierCapabilities(role: string): Capability[] {
  // Validate the role is a project-tier role
  if (!isProjectTierRole(role)) {
    return [];
  }
  return projectTierCapabilities(role as const);
}

/** Check if any of the given roles have the specified capability. */
export function hasCapabilityAny(
  roles: string[],
  capability: string
): boolean {
  return roles.some((role) => canViewCapability(role, capability));
}

/** Check if a specific role can view a specific capability. */
export function canViewCapability(role: string, capability: string): boolean {
  const caps = identityCapabilities(role);
  return caps.includes(capability);
}

/** Get the overlap of capabilities between two roles. */
export function getCapabilityIntersection(
  roleA: string,
  roleB: string
): Set<Capability> {
  const capsA = new Set(identityCapabilities(roleA));
  const capsB = new Set(identityCapabilities(roleB));
  return new Set([...capsA].filter((x) => capsB.has(x)));
}

/** Check if roleA has strictly more capabilities than roleB. */
export function hasMoreCapabilitiesThan(roleA: string, roleB: string): boolean {
  const capsA = new Set(identityCapabilities(roleA));
  const capsB = new Set(identityCapabilities(roleB));
  // A has all of B's caps + at least one extra
  const allBCaps = new Set(capsB);
  return [...capsA].every((x) => allBCaps.has(x)) && capsA.size > capsB.size;
}

/** Get capabilities unique to a role (not shared with another). */
export function getUniqueCapabilities(
  role: string,
  excludeRole?: string
): Set<Capability> {
  const caps = new Set(identityCapabilities(role));
  if (excludeRole) {
    const excludeCaps = new Set(identityCapabilities(excludeRole));
    return new Set([...caps].filter((x) => !excludeCaps.has(x)));
  }
  return caps;
}

/** Check if role is allowed to view a specific column based on a simple
 * rule-set (used by UI components that need quick checks without
 * full matrix lookups). */
export function isColumnVisibleToRole(
  role: string,
  columnCategory: "budget" | "financial" | "projectScope" | "crm" | "utilization" | "ffe" | "statutory" | "audit" | "deliverable"
): boolean {
  switch (columnCategory) {
    case "budget":
      return canViewBudget(role);
    case "financial":
      return canViewFinancialRollup(role);
    case "projectScope":
      return canViewProjectScope(role);
    case "crm":
      return canViewCrm(role);
    case "utilization":
      return canViewUtilization(role);
    case "ffe":
      return canManageFFE(role);
    case "statutory":
      return canManageStatutory(role);
    case "audit":
      return canManageAudit(role);
    case "deliverable":
      return canManageDeliverable(role);
    default:
      return false;
  }
}

export type {
  BUDGET_VIEW_ROLES,
  FINANCIAL_ROLLUP_ROLES,
  PROJECT_SCOPE_ROLES,
};

/** Legacy compatibility: map old PERMS-style checks to new capability system. */
export function legacyPermCheck(
  role: string,
  perm: string
): boolean {
  // Map legacy permission names to capability names
  const permMap: Record<string, string> = {
    "budget:view": "budget:view",
    "financial:rollup": "financial:rollup", // not a real cap, fallback
    "project:scope": "project:scope", // not a real cap, fallback
    "crm:view": "crm:view",
    "utilization:view": "utilization:view",
    "ffe:manage": "ffe:manage",
    "statutory:manage": "statutory:manage",
    "audit:manage": "audit:manage",
    "crm:manage": "crm:manage",
    "deliverable:manage": "deliverable:manage",
  };

  const capability = permMap[perm];
  if (!capability) return false;
  return canViewCapability(role, capability);
}

/** Return true if the role is an org-admin or superadmin (bypasses most column checks). */
export function isOrgAdminOrSuper(role: string): boolean {
  return role === "orgadmin" || role === "superadmin";
}

// Export all IdentityRole values for convenience
export const IDENTITY_ROLES_LIST = [
  "superadmin",
  "orgadmin",
  "promoter",
  "project_admin",
  "prospector",
  "pm",
  "architect",
  "senior_architect",
  "junior_architect",
  "design_architect_interior",
  "design_head",
  "consultant_head",
  "mep_consultant",
  "structural_consultant",
  "consultant",
  "designer",
  "site_engineer",
  "contractor",
  "sub_contractor",
  "vendor",
  "client",
  "site_inspector",
];