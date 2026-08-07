// SiteTrack Pro — payment receipts + reconciliation (#30). Invoices & RA bills
// can be partially paid; receipts are recorded per target and reconcile the
// outstanding balance (net receivable/payable minus received).

export type PayResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ReceiptTarget = "invoice" | "ra_bill";

export interface Receipt {
  id: string;
  projectId: string;
  targetType: ReceiptTarget;
  targetId: string;
  amount: number;
  method: "bank" | "cash" | "upi" | "cheque" | "other";
  receivedOn: string | null;
  reference: string | null;
  notes: string | null;
  receivedByName: string | null;
}

export interface ReceiptInput {
  projectId: string;
  targetType: ReceiptTarget;
  targetId: string;
  amount: number;
  method: Receipt["method"];
  receivedOn?: string | null;
  reference?: string | null;
}

const T = {
  invoice: { method: "bank", target: "invoice" },
  ra_bill: { method: "bank", target: "ra_bill" },
} as const;

const METHODS = new Set(["bank", "cash", "upi", "cheque", "other"]);
const methodOf = (m: unknown): Receipt["method"] => (typeof m === "string" && METHODS.has(m) ? m as Receipt["method"] : "bank");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/** Receipts for one invoice / RA bill, newest first, with payee name joined. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listReceipts(client: Client, projectId: string, targetType: ReceiptTarget, targetId: string): Promise<PayResult<Receipt[]>> {
  try {
    const { data, error } = await client.from("payments")
      .select("id, project_id, target_type, target_id, amount, method, received_on, reference, notes, received_by(name)")
      .eq("project_id", projectId)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("received_on", { ascending: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const out: Receipt[] = rows.map(r => ({
      id: String(r.id),
      projectId: String(r.project_id),
      targetType: (T[r.target_type as keyof typeof T]?.target ?? "invoice") as ReceiptTarget,
      targetId: String(r.target_id),
      amount: Number(r.amount) || 0,
      method: methodOf(r.method),
      receivedOn: r.received_on ? String(r.received_on) : null,
      reference: r.reference ? String(r.reference) : null,
      notes: r.notes ? String(r.notes) : null,
      receivedByName: (r.received_by as { name?: string } | null)?.name ?? null,
    }));
    return { ok: true, data: out };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Record a receipt against an invoice or RA bill. Sets received_by = current user. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addReceipt(client: Client, input: ReceiptInput): Promise<PayResult<{ id: string }>> {
  try {
    const payload: Record<string, unknown> = {
      project_id: input.projectId,
      target_type: input.targetType,
      target_id: input.targetId,
      amount: input.amount,
      method: input.method,
      received_on: input.receivedOn ?? null,
      reference: input.reference ?? null,
    };
    const { data, error } = await client.from("payments").insert(payload).select("id").single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String((data as { id: string } | null)?.id ?? "p") } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Remove a mistaken receipt. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteReceipt(client: Client, receiptId: string): Promise<PayResult<null>> {
  try {
    const { error } = await client.from("payments").delete().eq("id", receiptId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Reconciliation totals for an invoice: net = amount + GST − TDS (GST/TDS in %). */
export function reconcileInvoice(inv: { amount: number; gst?: number | null; tds?: number | null }, receipts: Array<{ amount: number }>): { net: number; received: number; outstanding: number } {
  const amount = inv.amount || 0;
  const net = amount + Math.round((amount * (inv.gst || 0)) / 100) - Math.round((amount * (inv.tds || 0)) / 100);
  const received = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  return { net, received, outstanding: Math.max(0, net - received) };
}

/** Reconciliation totals for an RA bill: net = billAmount × (1 − retention). */
export function reconcileRaBill(bill: { billAmount: number; retentionPct?: number | null }, receipts: Array<{ amount: number }>): { net: number; received: number; outstanding: number } {
  const net = (bill.billAmount || 0) * (1 - ((bill.retentionPct ?? 0) / 100));
  const received = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  return { net, received, outstanding: Math.max(0, net - received) };
}
