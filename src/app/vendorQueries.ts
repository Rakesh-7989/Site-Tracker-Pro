// SiteTrack Pro — org vendor directory queries (material suppliers /
// subcontractors). DB-wired to the `vendors` table (migration 84 bridge).

export type VResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Vendor {
  id: string;
  name: string;
  category: string | null;
  contact: string | null;
  phone: string | null;
  gst: string | null;
  rating: number | null;
  profile_id: string | null;
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Group vendor options by category for `<Select groups>` optgroup rendering.
 * Uncategorised vendors fall into an "Other" group; groups sort by label.
 */
export function vendorOptionGroups(vendors: ReadonlyArray<{ id: string; name: string; category: string | null }>): ReadonlyArray<{ label: string; options: ReadonlyArray<{ value: string; label: string }> }> {
  const map = new Map<string, Array<{ value: string; label: string }>>();
  for (const v of vendors) {
    const group = v.category?.trim() ? v.category.trim() : "Other";
    const arr = map.get(group) ?? [];
    arr.push({ value: v.id, label: v.name });
    map.set(group, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, options]) => ({ label, options }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listVendors(client: any, orgId: string): Promise<VResult<Vendor[]>> {
  try {
    const { data, error } = await client.from("vendors").select("id, name, category, contact, phone, gst, rating, profile_id").eq("org_id", orgId).order("name", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), category: r.category == null ? null : String(r.category),
      contact: r.contact == null ? null : String(r.contact), phone: r.phone == null ? null : String(r.phone),
      gst: r.gst == null ? null : String(r.gst), rating: num(r.rating), profile_id: r.profile_id == null ? null : String(r.profile_id),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createVendor(client: any, input: { orgId: string; name: string; category?: string; contact?: string; phone?: string; gst?: string; rating?: number }): Promise<VResult<{ id: string }>> {
  try {
    const { data, error } = await client.from("vendors").insert({
      org_id: input.orgId, name: input.name, category: input.category || null, contact: input.contact || null,
      phone: input.phone || null, gst: input.gst || null, rating: input.rating ?? null,
    }).select("id").single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setVendorRating(client: any, id: string, rating: number): Promise<VResult<{ ok: true }>> {
  try { const { error } = await client.from("vendors").update({ rating }).eq("id", id); if (error) return { ok: false, error: String(error.message ?? error) }; return { ok: true, data: { ok: true } }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteVendor(client: any, id: string): Promise<VResult<{ ok: true }>> {
  try { const { error } = await client.from("vendors").delete().eq("id", id); if (error) return { ok: false, error: String(error.message ?? error) }; return { ok: true, data: { ok: true } }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateVendorProfile(client: any, vendorId: string, input: { name?: string; category?: string | null; contact?: string | null; phone?: string | null; gst?: string | null }): Promise<VResult<{ ok: true }>> {
  try {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.category !== undefined) patch.category = input.category;
    if (input.contact !== undefined) patch.contact = input.contact;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.gst !== undefined) patch.gst = input.gst;
    if (Object.keys(patch).length === 0) return { ok: true, data: { ok: true } };
    const { error } = await client.from("vendors").update(patch).eq("id", vendorId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
