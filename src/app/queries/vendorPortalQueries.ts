// SiteTrack Pro — Vendor Portal queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PO {
  id: string;
  no: string;
  amount: number;
  status: string;
  project_name: string;
  created: string;
  invoice_id: string | null;
  paid_amount: number;
  payment_status: "pending" | "partial" | "paid" | "overdue";
}
export interface MPrice {
  id: string;
  material: string;
  price: number;
  updated: string;
}

export async function listVendorPOs(client: any, vendorId: string): Promise<PResult<PO[]>> {
  try {
    const { data, error } = await client.from("purchase_orders")
      .select("id, po_no, amount, status, project:project_id(name), created_date, invoice_id, paid_amount, payment_status")
      .eq("vendor_id", vendorId)
      .order("created_date", { ascending: false })
      .limit(50);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        no: r.po_no ?? "",
        amount: r.amount ?? 0,
        status: r.status ?? "",
        project_name: r.project?.name ?? "",
        created: r.created_date ?? "",
        invoice_id: r.invoice_id ?? null,
        paid_amount: r.paid_amount ?? 0,
        payment_status: r.payment_status ?? "pending",
      }))
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listMaterialPrices(client: any, orgId: string): Promise<PResult<MPrice[]>> {
  try {
    const { data, error } = await client.from("material_prices")
      .select("id, material, rate, effective_at, created_at").eq("org_id", orgId).order("material").limit(50);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, material: r.material ?? "", price: r.rate ?? 0, updated: r.effective_at ?? r.created_at ?? "" })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
