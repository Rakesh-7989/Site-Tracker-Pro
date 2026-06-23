// SiteTrack Pro — Vendor Portal queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PO { id: string; no: string; amount: number; status: string; project_name: string; created: string; }
export interface MPrice { id: string; material: string; price: number; updated: string; }

export async function listVendorPOs(client: any): Promise<PResult<PO[]>> {
  try {
    const { data, error } = await client.from("purchase_orders")
      .select("id, no, amount, status, project:project_id(name), created_at").order("created_at", { ascending: false }).limit(20);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, no: r.no ?? "", amount: r.amount ?? 0, status: r.status ?? "", project_name: r.project?.name ?? "", created: r.created_at ?? "" })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listMaterialPrices(client: any): Promise<PResult<MPrice[]>> {
  try {
    const { data, error } = await client.from("material_prices")
      .select("id, material, price, updated_at").order("material").limit(50);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, material: r.material ?? "", price: r.price ?? 0, updated: r.updated_at ?? "" })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
