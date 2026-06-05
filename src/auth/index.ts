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

export {
  applyOverrides,
  normalizeOverride,
  baseCapabilitiesFor,
} from "./capabilityOverrides";

export {
  FEATURE_LABEL,
  capabilityLabel,
  capabilityGroups,
  groupOf,
  GROUP_LABEL,
  GROUP_ORDER,
} from "./capabilityLabels";

export type {
  AuthUser,
  OrgMembership,
  ProjectMembership,
  AuthSession,
  CapabilityOverride,
  ResolveContext,
  ResolvedCapabilities,
  CapabilityDecision,
} from "./types";

// ── Phase 1.5: React layer ────────────────────────────────────────────────
export {
  fetchAuthSession,
  buildAuthSession,
  normalizeProfile,
  normalizeOrgMembership,
  normalizeProjectMembership,
  pickActiveOrgId,
  type FetchOutcome,
  type FetchResult,
  type FetchFailure,
  type FetchInput,
} from "./fetchAuthSession";

export {
  readActiveOrgId,
  writeActiveOrgId,
  defaultStorage,
  memoryStorage,
  type StorageLike,
} from "./activeOrgStore";

export {
  useAuthUser,
  type AuthStatus,
  type UseAuthUserReturn,
  type UseAuthUserOptions,
} from "./useAuthUser";

export {
  AuthProvider,
  useAuth,
  useSession,
  type AuthContextValue,
} from "./OrganizationContext";

export {
  useOrgSwitcher,
  type UseOrgSwitcherReturn,
} from "./useOrgSwitcher";

export {
  useCan,
  useDecide,
  useHasRole,
  RequireCapability,
  RequireRole,
  RequireSession,
  type RequireCapabilityProps,
  type RequireRoleProps,
  type RequireSessionProps,
} from "./guards";
