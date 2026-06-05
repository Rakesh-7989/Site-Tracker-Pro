// SiteTrack Pro — per-org custom roles (HRMS pattern, migration 70).
//
// Pure normalizers + a helper to turn a member's assigned custom-role
// capabilities into synthetic GRANT overrides, so the existing RoleResolver
// (which already applies session.capabilityOverrides) picks them up with no
// resolver change. The session-fetcher loads the rows; queries do CRUD.

import { isCapability, type Capability } from "./capabilities";
import type { IdentityRole } from "./roles";
import type { CapabilityOverride, OrgCustomRole } from "./types";

/**
 * Normalize an org_roles row (optionally joined with org_role_capabilities)
 * into a typed OrgCustomRole. Returns null on shape mismatch.
 */
export function normalizeOrgRole(row: Record<string, unknown> | null): OrgCustomRole | null {
  if (!row) return null;
  const id = row.id ? String(row.id) : "";
  const orgId = row.org_id ? String(row.org_id) : "";
  const key = row.key ? String(row.key) : "";
  if (!id || !orgId || !key) return null;
  const capRows = (row.org_role_capabilities as Array<Record<string, unknown>> | undefined) ?? [];
  const capabilities = capRows
    .map(c => c.capability)
    .filter(isCapability) as Capability[];
  return {
    id,
    orgId,
    key,
    label: row.label ? String(row.label) : key,
    description: row.description == null ? null : String(row.description),
    basedOn: row.based_on == null ? null : String(row.based_on),
    capabilities,
  };
}

/**
 * Build synthetic grant overrides from a flat list of capabilities a member
 * holds via custom roles in an org. The resolver applies these on top of the
 * matrix for the member's identity role, scoped to that org.
 */
export function customRoleGrants(
  identityRole: IdentityRole,
  orgId: string,
  capabilities: ReadonlyArray<Capability>,
): CapabilityOverride[] {
  // de-dupe
  const seen = new Set<Capability>();
  const out: CapabilityOverride[] = [];
  for (const cap of capabilities) {
    if (seen.has(cap)) continue;
    seen.add(cap);
    out.push({ role: identityRole, capability: cap, mode: "grant", orgId });
  }
  return out;
}
