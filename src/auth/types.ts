// SiteTrack Pro — core auth types (v2 architecture).
//
// Single source of truth for User, Profile, OrgMembership, ProjectMembership
// shapes used everywhere in the TS rebuild. Mirrors the DB:
//   - profiles
//   - org_members
//   - project_members
//   - projects
//
// All shapes are intentionally narrow — they include ONLY the fields the
// auth layer needs. Per-feature types (DPR, milestones, etc.) live with
// their feature folders.

import type { IdentityRole, OrgTierRole, ProjectTierRole, ProjectType } from "./roles";
import type { Capability } from "./capabilities";

/** Canonical user identity. */
export interface AuthUser {
  /** auth.users.id (UUID) */
  id: string;
  /** auth.users.email */
  email: string;
  /** profiles.role */
  identityRole: IdentityRole;
  /** profiles.name */
  name: string;
  /** profiles.avatar */
  avatarUrl?: string | null;
  /** profiles.is_staff — orthogonal flag for SiteTrack staff (us) */
  isStaff: boolean;
}

/** Row from org_members joined with organizations.name. */
export interface OrgMembership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgTierRole;
  joinedAt: string;   // ISO timestamp
}

/**
 * Superadmin-managed capability override (migration 69). Layered on top of
 * the hardcoded matrix for a given identity role, scoped to one org or
 * global (orgId null). Applied by RoleResolver after the tier union.
 */
export interface CapabilityOverride {
  /** identity role this override customizes */
  role: IdentityRole;
  capability: Capability;
  mode: "grant" | "revoke";
  /** null = global (every org); otherwise this org only */
  orgId: string | null;
}

/** Row from project_members joined with projects (name + type). */
export interface ProjectMembership {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  /** project_members.role — what THIS user does on THIS project */
  role: ProjectTierRole;
  /** project_members.assigned_by (profile_id) */
  assignedBy?: string | null;
  /** ISO timestamp */
  assignedAt: string;
  /** Soft-delete column — null = active */
  removedAt: string | null;
}

/**
 * The complete auth state for the current session. Built once on app boot
 * by useAuthUser(); consumed by RoleResolver + UI gates.
 *
 * activeOrgId tracks which org the user is currently OPERATING in (for
 * multi-org users). Persisted to localStorage so refresh keeps the choice.
 */
export interface AuthSession {
  user: AuthUser;
  orgs: OrgMembership[];
  activeOrgId: string | null;
  /** Project memberships across ALL orgs the user is in. */
  projectMemberships: ProjectMembership[];
  /**
   * Superadmin capability overrides relevant to THIS user — pre-filtered at
   * fetch time to (global + activeOrg) for the user's identity role. Optional
   * so existing session builders stay valid; resolver treats absent as [].
   */
  capabilityOverrides?: CapabilityOverride[];
}

/** Context for a capability resolution decision. */
export interface ResolveContext {
  /** When set, layer org-tier capabilities for this specific org. */
  orgId?: string;
  /** When set, layer project-tier capabilities for this specific project. */
  projectId?: string;
}

/** Output of RoleResolver.resolveCapabilities. */
export interface ResolvedCapabilities {
  /** The union set of capabilities the user holds in the requested context. */
  capabilities: Set<Capability>;
  /** Trace of which tier(s) granted what — useful for debugging UX gates. */
  trace: {
    fromIdentity: Capability[];
    fromOrgTier?: Capability[];
    fromProjectTier?: Capability[];
    /** Capabilities added by a superadmin override (migration 69). */
    overrideGrants?: Capability[];
    /** Capabilities removed by a superadmin override (migration 69). */
    overrideRevokes?: Capability[];
  };
}

/** Decision returned by can() and the React useCan() hook. */
export interface CapabilityDecision {
  allowed: boolean;
  reason: string;
}
