// SiteTrack Pro — Org-wide invoice rollup with payment reconciliation.
// Mirrors CrossRaBillsView + crossRaQueries pattern for invoices.

import type { MemberProjectScope } from "./queries";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface CrossInvoice {
  id: string;
  no: string;
  amount: number;
  gst: number;
  tds: number;
  status: InvoiceStatus;
  issuedDate: string | null;
  projectId: string;
  projectName: string;
  projectType: string | null;
  netReceivable: number;  // amount + gst - tds
  received: number;       // sum of payments
  outstanding: number;    // net - received
  paymentStatus: "paid" | "partial" | "pending" | "overdue";
}

// Pure: compute net receivable = amount + gst - tds
export function netReceivable(amount: number, gst: number, tds: number): number {
  return amount + gst - tds;
}

// Pure: compute outstanding = net - received
export function outstanding(net: number, received: number): number {
  return Math.max(0, net - received);
}

// Pure: determine payment status from received vs net
export function paymentStatusFrom(received: number, net: number, dueDate: string | null): "paid" | "partial" | "pending" | "overdue" {
  if (received >= net) return "paid";
  if (received > 0) return "partial";
  if (dueDate && new Date(dueDate) < new Date()) return "overdue";
  return "pending";
}

// Pure: org-wide rollup
export interface CrossInvoiceRollup {
  totalInvoices: number;
  totalAmount: number;
  totalNet: number;
  totalReceived: number;
  totalOutstanding: number;
  byStatus: Record<InvoiceStatus, number>;
  byPaymentStatus: Record<"paid" | "partial" | "pending" | "overdue", number>;
}

export function crossInvoiceRollup(invoices: CrossInvoice[]): CrossInvoiceRollup {
  const rollup: CrossInvoiceRollup = {
    totalInvoices: invoices.length,
    totalAmount: 0,
    totalNet: 0,
    totalReceived: 0,
    totalOutstanding: 0,
    byStatus: { draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0 },
    byPaymentStatus: { paid: 0, partial: 0, pending: 0, overdue: 0 },
  };
  for (const inv of invoices) {
    rollup.totalAmount += inv.amount;
    rollup.totalNet += inv.netReceivable;
    rollup.totalReceived += inv.received;
    rollup.totalOutstanding += inv.outstanding;
    rollup.byStatus[inv.status] += 1;
    rollup.byPaymentStatus[inv.paymentStatus] += 1;
  }
  return rollup;
}

// ── Query mappers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgInvoices(client: any, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<CrossInvoice[]>> {
  try {
    // Fetch projects in org first
    let projQ = client.from("projects").select("id").eq("org_id", orgId);
    if (scope.mode === "member") {
      // PostgREST ignores `IN ()` on an empty array — short-circuit instead.
      if (scope.projectIds.length === 0) return ok([]);
      projQ = projQ.in("id", scope.projectIds);
    }
    const projRes = await projQ;
    if (projRes.error) return dbe(projRes.error);
    const projectIds = (projRes.data ?? []).map((p: any) => p.id);
    if (projectIds.length === 0) return ok([]);

    // Fetch invoices for these projects; payments are polymorphic
    // (target_type/target_id, no invoice_id FK) so they're fetched separately
    // by target and grouped back onto invoices. `invoices` has no `created_at`
    // — order by `issued_date`.
    const { data, error } = await client
      .from("invoices")
      .select(`
        id, no, amount, gst, tds, status, issued_date, due_date, project_id,
        project:projects(id, name, type)
      `)
      .in("project_id", projectIds)
      .order("issued_date", { ascending: false, nullsFirst: false });
    if (error) return dbe(error);

    const raw = ((data ?? []) as any[]);
    const invoiceIds = raw.map(r => String(r.id));
    let paymentsByInvoice: Record<string, any[]> = {};
    if (invoiceIds.length > 0) {
      const { data: pData, error: pErr } = await client
        .from("payments")
        .select("target_id, amount")
        .eq("target_type", "invoice")
        .in("target_id", invoiceIds);
      if (pErr) return dbe(pErr);
      paymentsByInvoice = ((pData ?? []) as any[]).reduce<Record<string, any[]>>((acc, p) => {
        const tid = String(p.target_id ?? "");
        (acc[tid] ||= []).push(p);
        return acc;
      }, {});
    }

    const invoices = raw.map(r => {
      const amount = Number(r.amount ?? 0);
      const gst = Number(r.gst ?? 0);
      const tds = Number(r.tds ?? 0);
      const netReceivable = amount + gst - tds;
      const received = (paymentsByInvoice[String(r.id)] ?? []).reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
      const outstanding = Math.max(0, netReceivable - received);
      const project = r.project as { id?: string; name?: string; type?: string } | null;
      return {
        id: String(r.id),
        no: String(r.no ?? ""),
        amount,
        gst,
        tds,
        status: r.status as "draft" | "sent" | "paid" | "overdue" | "cancelled",
        issuedDate: r.issued_date ?? null,
        projectId: String(r.project_id ?? ""),
        projectName: project?.name ?? "",
        projectType: project?.type ?? null,
        netReceivable,
        received,
        outstanding,
        paymentStatus: paymentStatusFrom(received, netReceivable, r.due_date ?? r.issued_date ?? null),
      };
    });
    return ok(invoices);
  } catch (e) { return er(e); }
}

// ── Org-wide rollup ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgInvoicesWithPayments(client: any, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<CrossInvoice[]>> {
  // Reuse listOrgInvoices - it already includes payment aggregation
  return listOrgInvoices(client, orgId, scope);
}