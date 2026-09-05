// SiteTrack Pro — Vendor Portal queries.

import type { TypedSupabaseClient } from "@/lib/supabase/db";

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

export async function listVendorPOs(client: TypedSupabaseClient, vendorId: string): Promise<PResult<PO[]>> {
  try {
    const { data, error } = await client.from("purchase_orders")
      .select("id, po_no, amount, status, project_id, created_date, invoice_id, paid_amount, payment_status")
      .eq("vendor_id", vendorId)
      .order("created_date", { ascending: false })
      .limit(50);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const projectIds = Array.from(new Set(rows.map(r => String(r.project_id)).filter(Boolean)));
    const projectNames = new Map<string, string>();
    if (projectIds.length > 0) {
      const pRes = await client.from("projects").select("id, name").in("id", projectIds);
      if (!pRes.error) {
        for (const p of (pRes.data ?? []) as Array<Record<string, unknown>>) {
          projectNames.set(String(p.id), String(p.name ?? ""));
        }
      }
    }
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        no: String(r.po_no ?? ""),
        amount: Number(r.amount ?? 0),
        status: String(r.status ?? ""),
        project_name: String(r.project_id ? projectNames.get(String(r.project_id)) ?? "" : ""),
        created: String(r.created_date ?? ""),
        invoice_id: r.invoice_id == null ? null : String(r.invoice_id),
        paid_amount: Number(r.paid_amount ?? 0),
        payment_status: String(r.payment_status ?? "pending") as PO["payment_status"],
      }))
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listMaterialPrices(client: TypedSupabaseClient, orgId: string): Promise<PResult<MPrice[]>> {
  try {
    const { data, error } = await client.from("material_prices")
      .select("id, material, rate, effective_at, created_at").eq("org_id", orgId).order("material").limit(50);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), material: String(r.material ?? ""), price: Number(r.rate ?? 0), updated: String(r.effective_at ?? r.created_at ?? "") })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
