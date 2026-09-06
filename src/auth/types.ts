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

import type { IdentityRole, ProjectTierRole, ProjectType, ConstructionIndustry } from "./roles";
import type { Capability } from "./capabilities";
import type { CompanySegment } from "./segmentConfig";
import type { EnabledModules } from "@/modules/types";

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
  /** profiles.staff_tier — platform staff hierarchy (null = not staff). */
  staffTier?: StaffTier | null;
  /** profiles.profile_completed — false → user must finish their profile first. */
  profileCompleted?: boolean;
  /** profiles.must_change_password — true → user must pick a new password before entering (P-E temp-password flow). */
  mustChangePassword?: boolean;
  /**
   * Admin areas a staff MEMBER may access (migration 106). Owner/head → all.
   * Undefined for non-staff. A member with no explicit grants defaults to all.
   */
  staffAreas?: string[];
}

/** The admin areas a staff member can be scoped to (migration 106). */
export const STAFF_AREAS = ["signups", "orgs", "users", "roles", "upgrades"] as const;

/** Platform staff hierarchy tier (migration 99). Owner > Head > Member. */
export type StaffTier = "owner" | "head" | "member";

/** Row from org_members joined with organizations.name. */
export interface OrgMembership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  /**
   * What kind of company this org is (migration 134). Null for legacy orgs
   * that haven't picked a segment yet — treat as "all segments".
   */
  segment: CompanySegment | null;
  /**
   * Multi-segment picks (migration 228). Null = not configured (fall back to
   * the legacy single `segment`); concrete picks otherwise. Use
   * resolveOrgSegments() for the effective set.
   */
  segments?: CompanySegment[] | null;
  /**
   * What KIND of business runs this org (migration 240): developer / builder /
   * architecture_firm / interior_firm / contractor / consultant / pmc /
   * vendor. Null = legacy/unclassified — resolve with resolveOrgType() which
   * derives from segments when unambiguous. Drives role templates + per-firm
   * dashboards/AI agents (Role Intelligence Study, Aug-2026).
   */
  orgType?: import("./orgType").OrgType | null;
  /**
   * Which product modules the org has switched on (migration 155). Absent /
   * null = not configured yet → every module is treated as enabled
   * (back-compat with pre-module orgs).
   */
  enabledModules?: EnabledModules;
  isAdmin: boolean;
  joinedAt: string;   // ISO timestamp
  /**
   * Invitation status (migration 173). Only 'active' memberships grant
   * data access via RLS; 'invited' are pending acceptance; 'removed' are soft-deleted.
   */
  status: "active" | "invited" | "removed";
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

/**
 * A per-org custom role (HRMS designation, migration 70). Superadmin-defined;
 * org admins assign members to it. Its capabilities layer (additively) on the
 * member's resolved set when they operate in that org.
 */
export interface OrgCustomRole {
  id: string;
  orgId: string;
  key: string;
  label: string;
  description: string | null;
  /** optional standard role it was templated from (informational) */
  basedOn: string | null;
  capabilities: Capability[];
}

/** Row from project_members joined with projects (name + type). */
export interface ProjectMembership {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  /** Optional industry subtype when project.type === 'construction'. */
  industrySubtype?: ConstructionIndustry | null;
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
  /**
   * RBAC layer context (migrations 203–205) — populated by the session-fetcher
   * for the ACTIVE org. When absent, the resolver behaves exactly as before
   * (matrix-only). When present, the layered V2 resolver always applies
   * (RBAC V2 merged into the single integrated RBAC path — no modes).
   */
  rbacLayers?: RbacLayerContext;
}

/** Context for a capability resolution decision. */
export interface ResolveContext {
  /** When set, layer org-tier capabilities for this specific org. */
  orgId?: string;
  /** When set, layer project-tier capabilities for this specific project. */
  projectId?: string;
  /** RBAC V2 resource scope (migrations 203–205). */
  resource?: { type: string; id: string };
  /** Client identity (client portal / share context) for scoped grants. */
  clientEmail?: string;
}

/** Output of RoleResolver.resolveCapabilities. */
export interface ResolvedCapabilities {
  /** The union set of capabilities the user holds in the requested context. */
  capabilities: Set<Capability>;
  /** Trace of which tier(s) granted what — useful for debugging UX gates. */
  trace: {
    fromIdentity: Capability[];
    fromOrgAdmin?: Capability[];
    fromProjectTier?: Capability[];
    /** Capabilities added by a superadmin override (migration 69). */
    overrideGrants?: Capability[];
    /** Capabilities removed by a superadmin override (migration 69). */
    overrideRevokes?: Capability[];
    /** RBAC V2 delta (migrations 203–205) applied by the always-on layer. */
    v2?: { mode: string; denies: Capability[]; grants: Capability[] };
  };
}

/** Decision returned by can() and the React useCan() hook. */
export interface CapabilityDecision {
  allowed: boolean;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RBAC V2 layer types (migrations 203–205). Merged into the single integrated
// RBAC path — the layered resolver is always-on (no matrix/shadow/enforce
// modes). Mirrors the DB substrate:
//   rbac_capabilities, rbac_role_profiles, rbac_profile_bindings,
//   org_rbac_settings, authorization_audit, resource_acl_entries,
//   client_portal_permissions, vendor_project_scopes, rbac_profile_assignments.
// ─────────────────────────────────────────────────────────────────────────────

/** Capability catalog entry (rbac_capabilities). */
export interface CatalogEntry {
  id: Capability;
  domain: string;
  label: string;
  description: string | null;
  isActive: boolean;
}

/** Role profile (rbac_role_profiles). */
export interface RoleProfile {
  id: string;
  code: string;
  name: string;
  description: string | null;
  segment: string | null;
  scope: "org" | "project";
  /** System profiles reference an identity role whose matrix caps form the base. */
  sourceRole: IdentityRole | null;
  isSystem: boolean;
  orgId: string | null;
  createdAt: string;
}

/** Profile capability binding (rbac_profile_bindings). */
export interface ProfileBinding {
  id: string;
  profileId: string;
  capability: Capability;
  effect: "allow" | "deny";
  note: string | null;
}

/** Profile assignment (rbac_profile_assignments). */
export interface ProfileAssignment {
  id: string;
  orgId: string;
  profileId: string;
  userId: string;
  assignedBy: string | null;
  createdAt: string;
}

/** Resource ACL entry (resource_acl_entries). */
export interface ResourceAclEntry {
  id: string;
  orgId: string;
  resourceType: string;
  resourceId: string;
  subjectType: "user" | "org_tier" | "identity_role";
  subjectId: string;
  capability: Capability;
  effect: "allow" | "deny";
  note: string | null;
  createdAt: string;
}

/** Client portal permission (client_portal_permissions). */
export interface ClientPortalPermission {
  id: string;
  orgId: string;
  projectId: string | null;
  clientEmail: string;
  capability: Capability;
  createdAt: string;
}

/** Vendor project scope (vendor_project_scopes). */
export interface VendorProjectScope {
  id: string;
  orgId: string;
  projectId: string;
  vendorId: string;
  profileId: string | null;
  createdAt: string;
}

/** Authorization audit row (authorization_audit). */
export interface AuthorizationAuditEvent {
  id: string;
  actorId: string | null;
  orgId: string | null;
  projectId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  capability: Capability;
  effect: "allow" | "deny";
  mode: string;
  reason: string | null;
  createdAt: string;
}

/** Everything the layered resolver needs about a session's org context. */
export interface RbacLayerContext {
  /** Profiles the user is ASSIGNED to in this org (source-role base + bindings). */
  profiles: RoleProfile[];
  bindings: ProfileBinding[];
  /** Resource ACL rows for this org (matched client-side by resource + subject). */
  acl: ResourceAclEntry[];
  /** Client-scoped grants (identity-role client / client portal). */
  clientPermissions: ClientPortalPermission[];
  /** Vendor project scopes (identity-role vendor). */
  vendorScopes: VendorProjectScope[];
  /** Optional project scope for VNext hierarchy alignment. */
  projectId?: string;
  /**
   * SEC-05 fail-closed marker: the context fetch failed mid-way, so
   * profiles/bindings/acl/etc. are EMPTY. The resolver MUST treat a fetchError
   * as deny-all (never the broader matrix fallback). Set only by
   * fetchRbacLayers on partial failure.
   */
  fetchError?: boolean;
}

/** Result of the layered V2 decision. */
export interface RbacLayerDecision {
  allowed: boolean;
  /** Which layer made the call. */
  reason:
    | "superadmin"
    | "acl-deny"
    | "binding-deny"
    | "acl-allow"
    | "binding-allow"
    | "client"
    | "vendor"
    | "matrix"
    | "not-member";
  /** The capability that was evaluated. */
  capability: Capability;
}
