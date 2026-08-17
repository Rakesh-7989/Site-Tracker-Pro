// SiteTrack Pro — RBAC V2 types (migrations 203–205).
//
// Mirrors the DB substrate:
//   rbac_capabilities, rbac_role_profiles, rbac_profile_bindings,
//   org_rbac_settings, authorization_audit, resource_acl_entries,
//   client_portal_permissions, vendor_project_scopes, rbac_profile_assignments.

import type { Capability } from "@/auth/capabilities";
import type { IdentityRole } from "@/auth/roles";

/** Per-org V2 mode (org_rbac_settings.mode). */
export type Rbac2Mode = "matrix" | "shadow" | "enforce";

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

/** Everything the V2 resolver needs about a session's org context. */
export interface Rbac2Context {
  mode: Rbac2Mode;
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
}

/** Result of the V2 decision. */
export interface Rbac2Decision {
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