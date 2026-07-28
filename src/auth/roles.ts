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
export function isProjectTierRole(value: unknown): value is ProjectTierRole {
  return typeof value === "string" && (PROJECT_TIER_ROLES as readonly string[]).includes(value);
}
export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === "string" && (PROJECT_TYPES as readonly string[]).includes(value);
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

/**
 * Map an identity role to an org-tier role for org_members.role.
 * Org-tier roles are: admin | pm | architect | contractor | client | vendor.
 * Falls back to 'client' for unrecognised roles.
 */
const ORG_TIER_FOR_IDENTITY: Partial<Record<IdentityRole, string>> = {
  orgadmin: "admin",
  promoter: "admin",
  project_admin: "admin",
  prospector: "admin",
  pm: "pm",
  architect: "architect",
  senior_architect: "architect",
  junior_architect: "architect",
  design_architect_interior: "architect",
  design_head: "architect",
  consultant_head: "architect",
  mep_consultant: "architect",
  structural_consultant: "architect",
  consultant: "architect",
  designer: "architect",
  site_engineer: "architect",
  contractor: "contractor",
  sub_contractor: "contractor",
  vendor: "vendor",
  client: "client",
  site_inspector: "client",
};

export function orgTierForIdentityRole(role: IdentityRole): string {
  return ORG_TIER_FOR_IDENTITY[role] ?? "client";
}
