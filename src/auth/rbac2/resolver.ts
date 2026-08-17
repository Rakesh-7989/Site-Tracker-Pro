// SiteTrack Pro — RBAC V2 pure decision logic (migrations 203–205).
//
// Layered authorization model. The v3 RoleResolver computes the MATRIX union
// (identity + org tier + project tier + overrides). V2 layers on top:
//
//   superadmin       → allow (god)
//   binding deny     → deny  (profile-level explicit deny / SoD-style)
//   ACL deny         → deny  (resource-level explicit deny — always wins)
//   ACL allow        → allow (resource-level grant to this user/tier/role)
//   binding allow    → allow (profile delta grant)
//   client perm      → allow (share-scoped client grant)
//   vendor scope     → allow (project-scoped vendor grant)
//   matrix fallback  → allow iff the matrix union already grants it
//
// Deny wins over allow at every level. Mode gates what the resolver does:
//   'matrix'  → V2 data ignored, matrix decides (back-compat default)
//   'shadow'  → matrix decides, but the V2 outcome is computed + audited
//   'enforce' → V2 outcome decides (composeV2Caps replaces the matrix set)
//
// All functions are PURE (no client / no React) so they unit-test without a
// Supabase client — the same pattern as RoleResolver / capabilityOverrides.

import type { Capability, CapabilitySet } from "@/auth/capabilities";
import { identityCapabilities } from "@/auth/permissions-matrix";
import { isIdentityRole } from "@/auth/roles";
import type {
  ProfileBinding,
  Rbac2Context,
  Rbac2Decision,
  ResourceAclEntry,
  RoleProfile,
} from "./types";

/**
 * The BASE capability set a role profile contributes: the source_role's
 * identity caps (empty when no source_role / org-created profile), with the
 * profile's allow/deny bindings applied. Deny strips even caps the matrix
 * grants; allow adds new ones.
 */
export function profileCapabilities(
  profile: RoleProfile,
  bindings: ReadonlyArray<ProfileBinding>,
): CapabilitySet {
  const out = new Set<Capability>();
  if (profile.sourceRole && isIdentityRole(profile.sourceRole)) {
    for (const c of identityCapabilities(profile.sourceRole)) out.add(c);
  }
  const own = bindings.filter(b => b.profileId === profile.id);
  for (const b of own) {
    if (b.effect === "allow") out.add(b.capability);
    else out.delete(b.capability);
  }
  return out;
}

/** Union of every assigned profile's contribution. */
export function assignedProfileCapabilities(
  profiles: ReadonlyArray<RoleProfile>,
  bindings: ReadonlyArray<ProfileBinding>,
): CapabilitySet {
  const out = new Set<Capability>();
  for (const p of profiles) {
    for (const c of profileCapabilities(p, bindings)) out.add(c);
  }
  return out;
}

/** Explicit denies across every assigned profile (SoD-style). */
export function assignedProfileDenies(
  profiles: ReadonlyArray<RoleProfile>,
  bindings: ReadonlyArray<ProfileBinding>,
): Set<Capability> {
  const out = new Set<Capability>();
  const ids = new Set(profiles.map(p => p.id));
  for (const b of bindings) {
    if (ids.has(b.profileId) && b.effect === "deny") out.add(b.capability);
  }
  return out;
}

/** Match an ACL entry against the current user/resource context. */
export function aclEntryApplies(
  entry: ResourceAclEntry,
  ctx: { userId: string; identityRole: string; orgTier?: "admin" | "pm" | null },
  resource?: { type: string; id: string },
): boolean {
  if (resource) {
    if (entry.resourceType !== resource.type || entry.resourceId !== resource.id) {
      return false;
    }
  }
  switch (entry.subjectType) {
    case "user":
      return entry.subjectId === ctx.userId;
    case "identity_role":
      return entry.subjectId === ctx.identityRole;
    case "org_tier":
      return ctx.orgTier != null && entry.subjectId === ctx.orgTier;
    default:
      return false;
  }
}

/** First matching ACL decision for a capability (deny precedence). */
export function aclDecision(
  entries: ReadonlyArray<ResourceAclEntry>,
  capability: Capability,
  ctx: { userId: string; identityRole: string; orgTier?: "admin" | "pm" | null },
  resource?: { type: string; id: string },
): { denied: boolean; allowed: boolean } {
  let denied = false;
  let allowed = false;
  for (const e of entries) {
    if (e.capability !== capability) continue;
    if (!aclEntryApplies(e, ctx, resource)) continue;
    if (e.effect === "deny") denied = true;
    else allowed = true;
  }
  return { denied, allowed };
}

/**
 * Layered V2 decision for ONE capability. `matrixAllowed` is the v3 resolver's
 * matrix-union verdict. Returns the winning layer + whether V2 allows it.
 */
export function decideV2(input: {
  capability: Capability;
  matrixAllowed: boolean;
  isSuperadmin: boolean;
  ctx: Rbac2Context;
  userId: string;
  identityRole: string;
  /** Present when the caller holds an org-admin tier for the context org. */
  orgTier?: "admin" | "pm" | null;
  /** Present when the check is resource-scoped. */
  resource?: { type: string; id: string };
  /** Present for identity-role client users / client portal context. */
  clientEmail?: string;
}): Rbac2Decision {
  const { capability, matrixAllowed, isSuperadmin, ctx, userId, identityRole, orgTier, resource, clientEmail } = input;

  if (isSuperadmin) {
    return { allowed: true, reason: "superadmin", capability };
  }

  const denies = assignedProfileDenies(ctx.profiles, ctx.bindings);
  if (denies.has(capability)) {
    return { allowed: false, reason: "binding-deny", capability };
  }

  const acl = aclDecision(ctx.acl, capability, { userId, identityRole, orgTier }, resource);
  if (acl.denied) {
    return { allowed: false, reason: "acl-deny", capability };
  }

  if (acl.allowed) {
    return { allowed: true, reason: "acl-allow", capability };
  }

  const profileCaps = assignedProfileCapabilities(ctx.profiles, ctx.bindings);
  if (profileCaps.has(capability)) {
    return { allowed: true, reason: "binding-allow", capability };
  }

  if (clientEmail) {
    const perm = ctx.clientPermissions.some(
      p => p.capability === capability && (p.projectId === null || (resource && p.projectId === resource.id)),
    );
    if (perm) {
      return { allowed: true, reason: "client", capability };
    }
  }

  if (identityRole === "vendor" && resource && resource.type === "project") {
    const scoped = ctx.vendorScopes.some(s => s.projectId === resource.id);
    if (scoped) {
      const vendorAllowed = ["po:create", "po:approve", "material:price:view", "vendor:manage", "vendor:select", "procurement:view", "drawings:upload", "export:pdf", "message:send"];
      if (vendorAllowed.includes(capability)) {
        return { allowed: true, reason: "vendor", capability };
      }
    }
  }

  return { allowed: matrixAllowed, reason: "matrix", capability };
}

/**
 * Compose the EFFECTIVE capability set in 'enforce' mode: start from the
 * matrix union, add profile + ACL allows, strip profile + ACL denies.
 * Pure — used by resolveCapabilitiesV2 and unit tests.
 */
export function composeV2Caps(input: {
  matrix: CapabilitySet;
  ctx: Rbac2Context;
  userId: string;
  identityRole: string;
  orgTier?: "admin" | "pm" | null;
  resource?: { type: string; id: string };
  clientEmail?: string;
}): CapabilitySet {
  const { matrix, ctx, userId, identityRole, orgTier, resource, clientEmail } = input;
  const out = new Set<Capability>(matrix);

  for (const cap of Array.from(out)) {
    const d = decideV2({
      capability: cap,
      matrixAllowed: true,
      isSuperadmin: false,
      ctx,
      userId,
      identityRole,
      orgTier,
      resource,
      clientEmail,
    });
    if (!d.allowed) out.delete(cap);
  }

  // Add profile-allow + ACL-allow caps that weren't in the matrix.
  for (const cap of assignedProfileCapabilities(ctx.profiles, ctx.bindings)) {
    const d = decideV2({
      capability: cap,
      matrixAllowed: false,
      isSuperadmin: false,
      ctx,
      userId,
      identityRole,
      orgTier,
      resource,
      clientEmail,
    });
    if (d.allowed) out.add(cap);
  }

  // ACL-allow caps not in the matrix are also grants (resource-scoped).
  for (const e of ctx.acl) {
    if (e.effect !== "allow") continue;
    if (!aclEntryApplies(e, { userId, identityRole, orgTier }, resource)) continue;
    const d = decideV2({
      capability: e.capability,
      matrixAllowed: false,
      isSuperadmin: false,
      ctx,
      userId,
      identityRole,
      orgTier,
      resource,
      clientEmail,
    });
    if (d.allowed) out.add(e.capability);
  }

  return out;
}