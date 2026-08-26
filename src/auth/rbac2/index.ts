// SiteTrack Pro — RBAC V2 barrel export (migrations 203–205).
//
//   import { decideV2, composeV2Caps, listProfiles, writeAuditEvent } from "@/auth/rbac2";

export type {
  AuthorizationAuditEvent,
  CatalogEntry,
  ClientPortalPermission,
  ProfileAssignment,
  ProfileBinding,
  Rbac2Context,
  Rbac2Decision,
  Rbac2Mode,
  ResourceAclEntry,
  RoleProfile,
  VendorProjectScope,
} from "./types";

export {
  profileCapabilities,
  assignedProfileCapabilities,
  assignedProfileDenies,
  aclEntryApplies,
  aclDecision,
  decideV2,
  composeV2Caps,
} from "./resolver";

export type { QueryClient, Result, AuditSummary } from "./queries";
export {
  normalizeCatalogEntry,
  normalizeRoleProfile,
  normalizeProfileBinding,
  normalizeProfileAssignment,
  normalizeAclEntry,
  normalizeClientPermission,
  normalizeVendorScope,
  normalizeAuditEvent,
  listCatalog,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  listBindingsForProfiles,
  upsertBinding,
  deleteBinding,
  listAssignments,
  assignProfile,
  unassignProfile,
  listAclEntries,
  upsertAclEntry,
  deleteAclEntry,
  listClientPermissions,
  listVendorScopes,
  getOrgRbacMode,
  setOrgRbacMode,
  writeAuditEvent,
  listAuditEvents,
  auditSummary,
  cloneProfile,
  compareBindings,
} from "./queries";