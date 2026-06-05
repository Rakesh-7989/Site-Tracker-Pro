// SiteTrack Pro — capability-override queries (migration 69).
//
// Superadmin-only writes (RLS enforces is_superadmin()). These wrappers let
// the RoleManager UI list / set / clear per-role capability overrides for a
// given org (or global, orgId null). Same defensive {ok} result shape as
// app/queries.ts.

import type { Capability, CapabilityOverride, IdentityRole } from "@/auth";
import { normalizeOverride } from "@/auth";

export type OverrideResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface OrgOption {
  id: string;
  name: string;
}

/** List orgs the caller can see (superadmin → all). For the org selector. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgsForOverrides(client: any): Promise<OverrideResult<OrgOption[]>> {
  try {
    const { data, error } = await client
      .from("organizations")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const orgs = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? "Org"),
    }));
    return { ok: true, data: orgs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** List overrides for a scope: orgId null = global rows; otherwise that org. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listCapabilityOverrides(client: any, orgId: string | null): Promise<OverrideResult<CapabilityOverride[]>> {
  try {
    let q = client.from("role_capability_overrides").select("org_id, role, capability, mode");
    q = orgId === null ? q.is("org_id", null) : q.eq("org_id", orgId);
    const { data, error } = await q;
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const overrides = rows
      .map(normalizeOverride)
      .filter((o): o is CapabilityOverride => o !== null);
    return { ok: true, data: overrides };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Set (grant or revoke) an override. Idempotent: clears any existing row for
 * (orgId, role, capability) first, then inserts the new mode.
 */
export async function setCapabilityOverride(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string | null; role: IdentityRole; capability: Capability; mode: "grant" | "revoke"; createdBy: string },
): Promise<OverrideResult<{ ok: true }>> {
  try {
    const cleared = await clearCapabilityOverride(client, input);
    if (!cleared.ok) return cleared;
    const { error } = await client.from("role_capability_overrides").insert({
      org_id: input.orgId,
      role: input.role,
      capability: input.capability,
      mode: input.mode,
      created_by: input.createdBy,
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Remove an override (revert the capability to the base matrix / "inherit"). */
export async function clearCapabilityOverride(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string | null; role: IdentityRole; capability: Capability },
): Promise<OverrideResult<{ ok: true }>> {
  try {
    let del = client.from("role_capability_overrides").delete()
      .eq("role", input.role)
      .eq("capability", input.capability);
    del = input.orgId === null ? del.is("org_id", null) : del.eq("org_id", input.orgId);
    const { error } = await del;
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
