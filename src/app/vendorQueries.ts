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
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listVendors(client: any, orgId: string): Promise<VResult<Vendor[]>> {
  try {
    const { data, error } = await client.from("vendors").select("id, name, category, contact, phone, gst, rating").eq("org_id", orgId).order("name", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), category: r.category == null ? null : String(r.category),
      contact: r.contact == null ? null : String(r.contact), phone: r.phone == null ? null : String(r.phone),
      gst: r.gst == null ? null : String(r.gst), rating: num(r.rating),
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
