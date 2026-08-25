import { getClient } from "@/lib/supabase";

export interface Invoice {
  id: string;
  projectId: string;
  no: string;
  amount: number;
  gstPct: number;
  tdsPct: number;
  status: string;
  issuedDate: string | null;
  paidDate: string | null;
}

export interface RaBill {
  id: string;
  projectId: string;
  no: string;
  subcontractor: string | null;
  scope: string | null;
  billAmount: number;
  cumulative: number | null;
  retentionPct: number;
  paidAmount: number;
  status: string;
  billDate: string | null;
}

interface InvoiceRow {
  id: string;
  project_id: string | null;
  no: string | null;
  amount: number | null;
  gst: number | null;
  tds: number | null;
  status: string | null;
  issued_date: string | null;
  paid_date: string | null;
}

interface RaBillRow {
  id: string;
  project_id: string | null;
  no: string | null;
  subcontractor: string | null;
  scope: string | null;
  bill_amount: number | null;
  cumulative: number | null;
  retention_pct: number | null;
  paid_amount: number | null;
  status: string | null;
  bill_date: string | null;
}

function mapInvoice(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    projectId: r.project_id ?? "",
    no: r.no ?? "",
    amount: r.amount ?? 0,
    gstPct: r.gst ?? 18,
    tdsPct: r.tds ?? 2,
    status: r.status ?? "sent",
    issuedDate: r.issued_date,
    paidDate: r.paid_date,
  };
}

function mapRaBill(r: RaBillRow): RaBill {
  return {
    id: r.id,
    projectId: r.project_id ?? "",
    no: r.no ?? "",
    subcontractor: r.subcontractor,
    scope: r.scope,
    billAmount: r.bill_amount ?? 0,
    cumulative: r.cumulative,
    retentionPct: r.retention_pct ?? 5,
    paidAmount: r.paid_amount ?? 0,
    status: r.status ?? "submitted",
    billDate: r.bill_date,
  };
}

export function netReceivable(
  amount: number,
  gstPct: number,
  tdsPct: number,
): number {
  return Math.round(amount * (1 + gstPct / 100 - tdsPct / 100));
}

export function raNetPayable(billAmount: number, retentionPct: number): number {
  return Math.round(billAmount * (1 - retentionPct / 100));
}

export type PaymentStatus = "paid" | "partial" | "pending" | "overdue";

export function paymentStatus(invoice: Invoice): PaymentStatus {
  if (invoice.status === "cancelled") return "pending";
  if (invoice.paidDate || invoice.status === "paid") return "paid";
  if (invoice.status === "overdue") return "overdue";
  return "pending";
}

export const INVOICE_STATUS_TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  paid: "success",
  sent: "neutral",
  overdue: "error",
  cancelled: "neutral",
};

export async function listInvoices(projectId: string): Promise<Invoice[]> {
  const { data, error } = await getClient()
    .from("invoices")
    .select("id, project_id, no, amount, gst, tds, status, issued_date, paid_date")
    .eq("project_id", projectId)
    .order("issued_date", { ascending: false });
  if (error) throw new Error(`invoices-failed:${error.message}`);
  return ((data ?? []) as unknown as InvoiceRow[]).map(mapInvoice);
}

export async function listRaBills(projectId: string): Promise<RaBill[]> {
  const { data, error } = await getClient()
    .from("ra_bills")
    .select(
      "id, project_id, no, subcontractor, scope, bill_amount, cumulative, retention_pct, paid_amount, status, bill_date",
    )
    .eq("project_id", projectId)
    .order("bill_date", { ascending: false });
  if (error) throw new Error(`rabills-failed:${error.message}`);
  return ((data ?? []) as unknown as RaBillRow[]).map(mapRaBill);
}

export async function createInvoice(
  projectId: string,
  input: { amount: number; gstPct: number; tdsPct: number },
): Promise<Invoice> {
  const no = `INV-${Date.now().toString(36).toUpperCase()}`;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await getClient()
    .from("invoices")
    .insert({
      project_id: projectId,
      no,
      amount: Math.max(0, Math.round(input.amount)),
      gst: input.gstPct,
      tds: input.tdsPct,
      status: "sent",
      issued_date: today,
    })
    .select("id, project_id, no, amount, gst, tds, status, issued_date, paid_date")
    .single();
  if (error) throw new Error(`invoice-create-failed:${error.message}`);
  return mapInvoice(data as unknown as InvoiceRow);
}
