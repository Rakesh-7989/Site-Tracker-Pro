// SiteTrack Pro — per-org custom role CRUD (migration 70).
//
// Superadmin-only writes (RLS: org_roles_write = is_superadmin()). The
// RoleManager "Custom Roles" panel uses these to create/list/edit/delete an
// org's custom roles + their capability sets.

import type { Capability, OrgCustomRole } from "@/auth";
import { normalizeOrgRole } from "@/auth";

export type CRResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** List an org's custom roles (with their capabilities). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgRoles(client: any, orgId: string): Promise<CRResult<OrgCustomRole[]>> {
  try {
    const { data, error } = await client
      .from("org_roles")
      .select("id, org_id, key, label, description, based_on, org_role_capabilities(capability)")
      .eq("org_id", orgId)
      .order("label", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const roles = ((data ?? []) as Array<Record<string, unknown>>)
      .map(normalizeOrgRole)
      .filter((r): r is OrgCustomRole => r !== null);
    return { ok: true, data: roles };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Create a custom role + its capabilities. Returns the new role id. */
export async function createOrgRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string; key: string; label: string; description?: string; basedOn?: string | null; capabilities: Capability[]; createdBy: string },
): Promise<CRResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("org_roles")
      .insert({
        org_id: input.orgId,
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        based_on: input.basedOn ?? null,
        created_by: input.createdBy,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    const id = String(data.id);
    const capRes = await setOrgRoleCapabilities(client, id, input.capabilities);
    if (!capRes.ok) return capRes;
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Replace a custom role's capability set (delete-all + insert). */
export async function setOrgRoleCapabilities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  orgRoleId: string,
  capabilities: Capability[],
): Promise<CRResult<{ ok: true }>> {
  try {
    const del = await client.from("org_role_capabilities").delete().eq("org_role_id", orgRoleId);
    if (del.error) return { ok: false, error: String(del.error.message ?? del.error) };
    if (capabilities.length > 0) {
      const rows = capabilities.map(c => ({ org_role_id: orgRoleId, capability: c }));
      const ins = await client.from("org_role_capabilities").insert(rows);
      if (ins.error) return { ok: false, error: String(ins.error.message ?? ins.error) };
    }
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Update a custom role's label/description. */
export async function updateOrgRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  orgRoleId: string,
  patch: { label?: string; description?: string | null },
): Promise<CRResult<{ ok: true }>> {
  try {
    const { error } = await client.from("org_roles").update(patch).eq("id", orgRoleId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Delete a custom role (cascades capabilities + assignments). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteOrgRole(client: any, orgRoleId: string): Promise<CRResult<{ ok: true }>> {
  try {
    const { error } = await client.from("org_roles").delete().eq("id", orgRoleId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Slugify a label into a stable role key (lowercase, underscores). */
export function slugifyRoleKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "custom_role";
}
