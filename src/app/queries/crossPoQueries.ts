// SiteTrack Pro — cross-project purchase orders. Every PO across the org's
// projects via the org_purchase_orders RPC (migration 88), member-gated.

export type CPResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type POStatus = "pending" | "approved" | "delivered" | "cancelled";
export interface CrossPO {
  id: string;
  poNo: string;
  projectId: string;
  projectName: string;
  vendorName: string | null;
  items: string | null;
  amount: number;
  status: POStatus;
  createdDate: string | null;
  deliveryDate: string | null;
  receivedAmount: number;
  openAmount: number;
  requestedByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

const asStatus = (v: unknown): POStatus => (["pending", "approved", "delivered", "cancelled"].includes(v as string) ? (v as POStatus) : "pending");
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgPurchaseOrders(client: any, orgId: string): Promise<CPResult<CrossPO[]>> {
  try {
    const { data, error } = await client.rpc("org_purchase_orders", { p_org: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), poNo: String(r.po_no ?? ""), projectId: String(r.project_id), projectName: String(r.project_name ?? ""),
      vendorName: r.vendor_name == null ? null : String(r.vendor_name), items: r.items == null ? null : String(r.items),
      amount: num(r.amount), status: asStatus(r.status),
      createdDate: r.created_date == null ? null : String(r.created_date).slice(0, 10),
      deliveryDate: r.delivery_date == null ? null : String(r.delivery_date).slice(0, 10),
      receivedAmount: num(r.received_amount),
      openAmount: num(r.open_amount),
      requestedByName: r.requested_by_name == null ? null : String(r.requested_by_name),
      approvedByName: r.approved_by_name == null ? null : String(r.approved_by_name),
      approvedAt: r.approved_at == null ? null : String(r.approved_at),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Sum amounts by status for the summary strip. */
export function poTotals(rows: CrossPO[]): { count: number; total: number; byStatus: Record<POStatus, number> } {
  const byStatus: Record<POStatus, number> = { pending: 0, approved: 0, delivered: 0, cancelled: 0 };
  let total = 0;
  for (const r of rows) { byStatus[r.status] += r.amount; if (r.status !== "cancelled") total += r.amount; }
  return { count: rows.length, total, byStatus };
}
