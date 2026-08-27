// SiteTrack Pro — purchase order goods-receipt queries (v4 Phase E).
// DB: po_receipts (migration 158). Project-scoped (RLS mirrors purchase_orders:
// read = project members via can_read_project, write = manager set). Each
// receipt is a delivered batch against a PO: qty × unit_price snapshot →
// amount. Frontend rollups (received vs PO amount, fully-delivered) are pure.

export type RResult<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): RResult<T> => ({ ok: true, data: d });
const er = (e: unknown): RResult<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): RResult<never> => ({ ok: false, error: String(e.message ?? e) });

export interface PoReceipt {
  id: string;
  poId: string;
  receivedDate: string;
  qty: number;
  unitPrice: number;
  amount: number;
  notes: string | null;
  receivedByName: string | null;
  createdAt: string;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Line total for a receipt batch: qty × unit price. */
export function receiptAmount(qty: number, unitPrice: number): number {
  return Math.max(1, Number(qty) || 1) * Math.max(0, Number(unitPrice) || 0);
}

/** Sum of all receipt amounts against a PO. */
export function receivedTotal(receipts: Pick<PoReceipt, "amount">[]): number {
  return receipts.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

/** Outstanding (open) amount on a PO: amount − received, clamped ≥ 0. */
export function openAmount(poAmount: number, receipts: Pick<PoReceipt, "amount">[]): number {
  return Math.max(0, (Number(poAmount) || 0) - receivedTotal(receipts));
}

/** Delivery progress 0–100: received / PO amount (0 when amount is 0/empty). */
export function deliveryProgress(poAmount: number, receipts: Pick<PoReceipt, "amount">[]): number {
  const po = Number(poAmount) || 0;
  if (po <= 0) return 0;
  const ratio = receivedTotal(receipts) / po;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/** A PO counts as fully delivered when received ≥ amount. */
export function isFullyDelivered(poAmount: number, receipts: Pick<PoReceipt, "amount">[]): boolean {
  return receivedTotal(receipts) >= (Number(poAmount) || 0) && (Number(poAmount) || 0) > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPoReceipts(client: any, poId: string): Promise<RResult<PoReceipt[]>> {
  try {
    const { data, error } = await client
      .from("po_receipts")
      .select("id, po_id, received_date, qty, unit_price, amount, notes, received_by, received_by:received_by(name), created_at")
      .eq("po_id", poId)
      .order("received_date", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      poId: String(r.po_id ?? ""),
      receivedDate: r.received_date == null ? "" : String(r.received_date).slice(0, 10),
      qty: num(r.qty),
      unitPrice: num(r.unit_price),
      amount: num(r.amount),
      notes: r.notes == null ? null : String(r.notes),
      receivedByName: (r.received_by as { name?: unknown } | null)?.name == null ? null : String((r.received_by as { name?: unknown }).name),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addPoReceipt(client: any, input: {
  poId: string;
  receivedDate?: string;
  qty: number;
  unitPrice: number;
  notes?: string | null;
}): Promise<RResult<{ id: string }>> {
  try {
    const qty = Math.max(1, Number(input.qty) || 1);
    const unitPrice = Math.max(0, Number(input.unitPrice) || 0);
    const { data, error } = await client.from("po_receipts").insert({
      po_id: input.poId,
      received_date: input.receivedDate || null,
      qty,
      unit_price: unitPrice,
      amount: qty * unitPrice,
      notes: input.notes || null,
    }).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deletePoReceipt(client: any, id: string): Promise<RResult<{ ok: true }>> {
  try {
    const { error } = await client.from("po_receipts").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}
