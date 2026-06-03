// SiteTrack Pro — auth barrel export.
//
// Import surface for the rest of the app:
//   import { resolveCapabilities, can, type AuthUser } from "@/auth";
//
// React hooks + context providers land in Phase 1.5 (useAuthUser,
// OrganizationContext, guards.tsx). For now this only re-exports the
// pure logic + types.

export {
  IDENTITY_ROLES,
  ORG_TIER_ROLES,
  PROJECT_TIER_ROLES,
  PROJECT_TYPES,
  VALID_PROJECT_ROLES_BY_TYPE,
  ROLE_CATEGORY,
  ROLE_LABEL,
  isIdentityRole,
  isOrgTierRole,
  isProjectTierRole,
  isProjectType,
  defaultOrgTierFor,
  defaultProjectTierFor,
  type IdentityRole,
  type OrgTierRole,
  type ProjectTierRole,
  type ProjectType,
  type RoleCategory,
} from "./roles";

export {
  CAPABILITIES,
  isCapability,
  capabilityDomain,
  type Capability,
  type CapabilitySet,
} from "./capabilities";

export {
  identityCapabilities,
  orgTierCapabilities,
  projectTierCapabilities,
} from "./permissions-matrix";

export {
  resolveCapabilities,
  can,
  decide,
  capabilitiesAnywhere,
} from "./RoleResolver";

export type {
  AuthUser,
  OrgMembership,
  ProjectMembership,
  AuthSession,
  ResolveContext,
  ResolvedCapabilities,
  CapabilityDecision,
} from "./types";
