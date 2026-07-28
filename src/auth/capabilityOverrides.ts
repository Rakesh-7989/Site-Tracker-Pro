// SiteTrack Pro — capability override application (migration 69).
//
// The hardcoded matrix (permissions-matrix.ts) is the BASE. A superadmin can
// layer per-org or global grants/revokes on top of it. This module is the
// pure logic that applies those overrides to a base capability set. The
// RoleResolver calls applyOverrides() after composing the tier union; the
// session-fetcher loads the rows.
//
// Rules:
//   - Only overrides matching the user's identity role apply.
//   - Global rows (orgId null) apply first; org-specific rows apply AFTER, so
//     an org row wins over a global row for the same capability.
//   - 'grant' adds the capability; 'revoke' removes it.
//   - superadmin is IMMUNE — overrides never strip the founder's god access.

import type { Capability } from "./capabilities";
import { isCapability } from "./capabilities";
import type { CapabilityOverride } from "./types";
import { type IdentityRole, isIdentityRole, defaultProjectTierFor } from "./roles";
import { identityCapabilities, projectTierCapabilities } from "./permissions-matrix";

/**
 * The BASE (pre-override) capability set a role gets when provisioned the
 * normal way: identity caps + org tier (only when elevated: admin/pm) +
 * project-tier default. Mirrors the effective set in docs/ROLE_FEATURES.md.
 * The RoleManager UI shows this so the admin sees what an override adds/removes.
 */
export function baseCapabilitiesFor(role: IdentityRole): Set<Capability> {
  const caps = new Set<Capability>(identityCapabilities(role));
  const pt = defaultProjectTierFor(role);
  if (pt) for (const c of projectTierCapabilities(pt)) caps.add(c);
  return caps;
}

/**
 * Apply overrides to a base capability set for a given identity role.
 * Returns a NEW set (does not mutate the input).
 */
export function applyOverrides(
  base: ReadonlySet<Capability>,
  overrides: ReadonlyArray<CapabilityOverride>,
  identityRole: IdentityRole,
): Set<Capability> {
  const out = new Set<Capability>(base);
  // superadmin is never altered.
  if (identityRole === "superadmin") return out;

  const relevant = overrides
    .filter(o => o.role === identityRole)
    // global (orgId null) first, org-specific second → org wins on conflict.
    .sort((a, b) => Number(a.orgId !== null) - Number(b.orgId !== null));

  for (const o of relevant) {
    if (o.mode === "grant") out.add(o.capability);
    else out.delete(o.capability);
  }
  return out;
}

/**
 * Normalize a raw role_capability_overrides DB row to a typed override.
 * Returns null on shape mismatch (caller filters .filter(Boolean)).
 */
export function normalizeOverride(row: Record<string, unknown> | null): CapabilityOverride | null {
  if (!row) return null;
  const role = row.role;
  const capability = row.capability;
  const mode = row.mode;
  if (!isIdentityRole(role)) return null;
  if (!isCapability(capability)) return null;
  if (mode !== "grant" && mode !== "revoke") return null;
  return {
    role,
    capability,
    mode,
    orgId: row.org_id === undefined || row.org_id === null ? null : String(row.org_id),
  };
}
