// SiteTrack Pro - plan-aware role defaults.
//
// RBAC still lives in permissions-matrix.ts. This file answers a different
// product question: which standard roles should an org admin normally see for
// the org's purchased plan, and which plan features should be visible as the
// plan promise. Enterprise/custom plans get the full customer role catalog.

import {
  FEATURE_MIN_PLAN,
  PLAN_FEATURE_LABEL,
  PLAN_RANK,
  type PlanFeature,
} from "./planCaps";
import {
  IDENTITY_ROLES,
  ORG_TIER_ROLES,
  PROJECT_TIER_ROLES,
  ROLE_LABEL,
  type IdentityRole,
  type OrgTierRole,
  type ProjectTierRole,
} from "./roles";

export type PlanId = "free" | "basic" | "pro" | "business" | "enterprise" | "custom";
export type RoleTier = "identity" | "org" | "project";

export const PLAN_LABEL: Record<PlanId, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
  custom: "Custom",
};

const CUSTOMER_IDENTITY_ROLES = IDENTITY_ROLES.filter(r => r !== "superadmin");

const BASIC_IDENTITY_ROLES = [
  "orgadmin",
  "promoter",
  "pm",
  "architect",
  "site_engineer",
  "contractor",
  "sub_contractor",
  "client",
] as const satisfies readonly IdentityRole[];

const PRO_IDENTITY_ROLES = [
  ...BASIC_IDENTITY_ROLES,
  "project_admin",
  "senior_architect",
  "junior_architect",
  "design_architect_interior",
  "mep_consultant",
  "structural_consultant",
  "consultant",
  "designer",
  "vendor",
] as const satisfies readonly IdentityRole[];

const BUSINESS_IDENTITY_ROLES = [
  ...PRO_IDENTITY_ROLES,
  "prospector",
  "design_head",
  "consultant_head",
  "site_inspector",
] as const satisfies readonly IdentityRole[];

const BASIC_ORG_ROLES = ["admin", "pm", "architect", "contractor", "client"] as const satisfies readonly OrgTierRole[];
const PRO_ORG_ROLES = [...BASIC_ORG_ROLES, "vendor"] as const satisfies readonly OrgTierRole[];

const BASIC_PROJECT_ROLES = [
  "architect",
  "site_engineer",
  "pm",
  "contractor",
  "sub_contractor",
  "client",
  "promoter",
] as const satisfies readonly ProjectTierRole[];

const PRO_PROJECT_ROLES = [
  ...BASIC_PROJECT_ROLES,
  "project_admin",
  "senior_architect",
  "junior_architect",
  "design_architect_interior",
  "mep_consultant",
  "structural_consultant",
  "consultant",
  "designer",
] as const satisfies readonly ProjectTierRole[];

const BUSINESS_PROJECT_ROLES = [
  ...PRO_PROJECT_ROLES,
  "design_head",
  "consultant_head",
  "site_inspector",
] as const satisfies readonly ProjectTierRole[];

export const CORE_PLAN_FEATURE_LABELS = [
  "Projects, DPR, updates, issues, punch lists",
  "Photos, voice notes, attendance, labour",
  "Materials, vendors, safety, inspections",
  "Client portal, messages, exports",
] as const;

export const ORG_TIER_LABEL: Record<OrgTierRole, string> = {
  admin: "Admin",
  pm: "PM",
  architect: "Architect",
  contractor: "Contractor",
  client: "Client",
  vendor: "Vendor",
};

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function normalizePlanId(plan: string | null | undefined): PlanId {
  if (plan === "free" || plan === "basic" || plan === "pro" || plan === "business" || plan === "enterprise" || plan === "custom") {
    return plan;
  }
  return "basic";
}

export function displayPlanLabel(plan: string | null | undefined): string {
  return PLAN_LABEL[normalizePlanId(plan)];
}

export function planAtLeast(plan: string | null | undefined, minPlan: string): boolean {
  const rank = PLAN_RANK[normalizePlanId(plan)] ?? PLAN_RANK.basic;
  const min = PLAN_RANK[normalizePlanId(minPlan)] ?? PLAN_RANK.basic;
  return rank >= min;
}

export function planFeaturesFor(plan: string | null | undefined): PlanFeature[] {
  return (Object.keys(FEATURE_MIN_PLAN) as PlanFeature[])
    .filter(feature => planAtLeast(plan, FEATURE_MIN_PLAN[feature]));
}

export function planFeatureLabelsFor(plan: string | null | undefined, includeCore = true): string[] {
  const gated = planFeaturesFor(plan).map(feature => PLAN_FEATURE_LABEL[feature]);
  return includeCore ? [...CORE_PLAN_FEATURE_LABELS, ...gated] : gated;
}

export function planSupportsCustomRoles(plan: string | null | undefined): boolean {
  return planAtLeast(plan, "business");
}

export function identityRolesForPlan(plan: string | null | undefined): IdentityRole[] {
  switch (normalizePlanId(plan)) {
    case "enterprise":
    case "custom":
      return [...CUSTOMER_IDENTITY_ROLES];
    case "business":
      return unique(BUSINESS_IDENTITY_ROLES);
    case "pro":
      return unique(PRO_IDENTITY_ROLES);
    case "free":
    case "basic":
      return unique(BASIC_IDENTITY_ROLES);
  }
}

export function orgTierRolesForPlan(plan: string | null | undefined): OrgTierRole[] {
  switch (normalizePlanId(plan)) {
    case "enterprise":
    case "custom":
      return [...ORG_TIER_ROLES];
    case "business":
    case "pro":
      return unique(PRO_ORG_ROLES);
    case "free":
    case "basic":
      return unique(BASIC_ORG_ROLES);
  }
}

export function projectTierRolesForPlan(plan: string | null | undefined): ProjectTierRole[] {
  switch (normalizePlanId(plan)) {
    case "enterprise":
    case "custom":
      return [...PROJECT_TIER_ROLES];
    case "business":
      return unique(BUSINESS_PROJECT_ROLES);
    case "pro":
      return unique(PRO_PROJECT_ROLES);
    case "free":
    case "basic":
      return unique(BASIC_PROJECT_ROLES);
  }
}

export function roleAllowedForPlan(plan: string | null | undefined, tier: RoleTier, role: string): boolean {
  if (tier === "identity") return identityRolesForPlan(plan).includes(role as IdentityRole);
  if (tier === "org") return orgTierRolesForPlan(plan).includes(role as OrgTierRole);
  return projectTierRolesForPlan(plan).includes(role as ProjectTierRole);
}

export function identityRoleLabel(role: IdentityRole): string {
  return ROLE_LABEL[role] ?? role;
}

export function orgTierRoleLabel(role: OrgTierRole): string {
  return ORG_TIER_LABEL[role] ?? role;
}

export function projectTierRoleLabel(role: ProjectTierRole): string {
  return ROLE_LABEL[role as IdentityRole] ?? role;
}

export function orgTierRoleOptionsForPlan(plan: string | null | undefined): Array<{ value: OrgTierRole; label: string }> {
  return orgTierRolesForPlan(plan).map(role => ({ value: role, label: orgTierRoleLabel(role) }));
}
