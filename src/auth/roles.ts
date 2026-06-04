// SiteTrack Pro — canonical 26-role catalog (v2 architecture).
//
// Source of truth for every role in the system. Mirrors:
//   - profiles.role CHECK constraint  (migration 58, 26 values)
//   - org_members.role CHECK constraint (migration 01, 5 values)
//   - project_members.role CHECK constraint (migration 59, 22 values)
//
// JS-side legacy: src/lib/permissions.js still defines a partial PERMS
// object. New code routes through here. The strangler-fig commit removes
// permissions.js in Phase 8.
//
// Each role belongs to exactly one tier (identity / org / project) for
// catalog purposes, but a single user can hold roles across all three
// tiers — see RoleResolver.ts for the 3-axis composition.

// ── Identity-tier roles (profiles.role — 22 values) ────────────────────────
// Consolidated 2026-06-04 per founder: site_supervisor merged into
// site_engineer, project_head into pm, interior_designer into
// design_architect_interior, and civil_engineer dropped (→ site_engineer).
export const IDENTITY_ROLES = [
  // Platform staff
  "superadmin",
  // Org level (firm-wide)
  "orgadmin",
  "promoter",
  "project_admin",
  "prospector",
  "pm",
  // Project-level execution
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
  // Supply chain
  "contractor",
  "sub_contractor",
  "vendor",
  // External + clients
  "client",
  "site_inspector",
] as const;
export type IdentityRole = (typeof IDENTITY_ROLES)[number];

// ── Org-tier roles (org_members.role — 6 values, migration 65) ─────────────
export const ORG_TIER_ROLES = ["admin", "pm", "architect", "contractor", "client", "vendor"] as const;
export type OrgTierRole = (typeof ORG_TIER_ROLES)[number];

// ── Project-tier roles (project_members.role — 18 values) ──────────────────
export const PROJECT_TIER_ROLES = [
  "architect",
  "senior_architect",
  "junior_architect",
  "design_architect_interior",
  "design_head",
  "consultant_head",
  "designer",
  "consultant",
  "mep_consultant",
  "structural_consultant",
  "site_engineer",
  "site_inspector",
  "pm",
  "project_admin",
  "contractor",
  "sub_contractor",
  "client",
  "promoter",
] as const;
export type ProjectTierRole = (typeof PROJECT_TIER_ROLES)[number];

// ── Project type → valid project_member roles ──────────────────────────────
export const PROJECT_TYPES = ["construction", "interior", "design", "consultant"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

/**
 * Which project_member.role values are valid for a given project.type.
 * UI dropdowns + member-add forms enforce this. RLS does not (yet).
 */
export const VALID_PROJECT_ROLES_BY_TYPE: Record<ProjectType, ReadonlyArray<ProjectTierRole>> = {
  construction: [
    "architect", "senior_architect", "junior_architect",
    "mep_consultant", "structural_consultant",
    "site_engineer", "site_inspector",
    "pm", "project_admin",
    "contractor", "sub_contractor",
    "client",
  ],
  interior: [
    "architect", "design_architect_interior",
    "mep_consultant",
    "site_engineer", "site_inspector",
    "pm", "project_admin",
    "contractor", "sub_contractor",
    "client",
  ],
  design: [
    "design_head", "architect", "designer",
    "project_admin",
    "client",
  ],
  consultant: [
    "consultant_head", "architect", "consultant",
    "project_admin",
    "client",
  ],
};

// ── Role categories for nav / UI grouping ──────────────────────────────────
export type RoleCategory =
  | "platform"
  | "org-leadership"
  | "project-execution"
  | "design-discipline"
  | "engineering-discipline"
  | "field-supervision"
  | "supply-chain"
  | "external";

export const ROLE_CATEGORY: Record<IdentityRole, RoleCategory> = {
  superadmin: "platform",

  orgadmin: "org-leadership",
  promoter: "org-leadership",
  project_admin: "org-leadership",
  prospector: "org-leadership",
  pm: "org-leadership",

  architect: "project-execution",
  senior_architect: "project-execution",
  junior_architect: "project-execution",

  design_architect_interior: "design-discipline",
  design_head: "design-discipline",
  designer: "design-discipline",

  consultant_head: "design-discipline",
  consultant: "design-discipline",

  mep_consultant: "engineering-discipline",
  structural_consultant: "engineering-discipline",
  site_engineer: "engineering-discipline",

  contractor: "supply-chain",
  sub_contractor: "supply-chain",
  vendor: "supply-chain",

  client: "external",
  site_inspector: "external",
};

// ── Display labels (English; te/hi catalogues live in src/data/i18n/) ──────
export const ROLE_LABEL: Record<IdentityRole, string> = {
  superadmin: "Platform Admin",
  orgadmin: "Firm Owner",
  promoter: "Promoter",
  project_admin: "Project Admin",
  prospector: "Sales / BD",
  pm: "Project Manager",
  architect: "Architect",
  senior_architect: "Senior Architect",
  junior_architect: "Junior Architect",
  design_architect_interior: "Design Architect (Interior)",
  design_head: "Design Head",
  consultant_head: "Consultant Head",
  mep_consultant: "MEP Consultant",
  structural_consultant: "Structural Consultant",
  consultant: "Consultant",
  designer: "Designer",
  site_engineer: "Site Engineer",
  contractor: "Contractor",
  sub_contractor: "Sub-contractor",
  vendor: "Vendor",
  client: "Client / Unit Buyer",
  site_inspector: "Site Inspector (RERA)",
};

// ── Type guards ────────────────────────────────────────────────────────────
export function isIdentityRole(value: unknown): value is IdentityRole {
  return typeof value === "string" && (IDENTITY_ROLES as readonly string[]).includes(value);
}
export function isOrgTierRole(value: unknown): value is OrgTierRole {
  return typeof value === "string" && (ORG_TIER_ROLES as readonly string[]).includes(value);
}
export function isProjectTierRole(value: unknown): value is ProjectTierRole {
  return typeof value === "string" && (PROJECT_TIER_ROLES as readonly string[]).includes(value);
}
export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === "string" && (PROJECT_TYPES as readonly string[]).includes(value);
}

/**
 * Map an identity role to its default org-tier role for auto-provisioning.
 * Used when a new user is added to an org without an explicit tier choice.
 */
export function defaultOrgTierFor(role: IdentityRole): OrgTierRole {
  if (role === "superadmin" || role === "orgadmin" || role === "promoter" || role === "project_admin") return "admin";
  if (role === "pm") return "pm";
  if (
    role === "architect" || role === "senior_architect" || role === "junior_architect" ||
    role === "design_architect_interior" ||
    role === "design_head" || role === "consultant_head" || role === "designer" ||
    role === "consultant" || role === "mep_consultant" || role === "structural_consultant" ||
    role === "site_engineer" ||
    role === "site_inspector"
  ) return "architect";
  if (role === "vendor") return "vendor";
  if (role === "contractor" || role === "sub_contractor") return "contractor";
  return "client";
}

/**
 * Map an identity role to a project-tier role when adding to a project
 * without an explicit choice. Returns null when the role can't be on a
 * project (e.g. superadmin, prospector).
 */
export function defaultProjectTierFor(role: IdentityRole): ProjectTierRole | null {
  if (role === "superadmin" || role === "prospector" || role === "orgadmin") return null;
  if (role === "vendor") return null;
  return role as ProjectTierRole;
}
