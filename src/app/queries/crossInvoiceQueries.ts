// SiteTrack Pro — Org-wide invoice rollup with payment reconciliation.
// Mirrors CrossRaBillsView + crossRaQueries pattern for invoices.

import type { TypedSupabaseClient } from "@/lib/supabase/db";
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
  netReceivable: number;  // amount × (1 + gst% − tds%) — GST/TDS are percentages
  received: number;       // sum of payments
  outstanding: number;    // net - received
  paymentStatus: "paid" | "partial" | "pending" | "overdue";
}

// Pure: net receivable = amount × (1 + gst% − tds%). GST/TDS columns are
// PERCENTAGES (invoices.gst numeric(4,2) default 18) — matches migration
// 239's server-side payment cap and financeQueries.invoiceTaxBreakup.
export function netReceivable(amount: number, gst: number, tds: number): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const gstPct = Number.isFinite(gst) ? gst : 0;
  const tdsPct = Number.isFinite(tds) ? tds : 0;
  return Math.round(safeAmount * (1 + gstPct / 100 - tdsPct / 100));
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

export async function listOrgInvoices(client: TypedSupabaseClient, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<CrossInvoice[]>> {
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
    const projectIds = (projRes.data ?? []).map((p) => String(p.id));
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

    const raw = ((data ?? []) as unknown as Record<string, unknown>[]);
    const invoiceIds = raw.map(r => String(r.id));
    let paymentsByInvoice: Record<string, Record<string, unknown>[]> = {};
    if (invoiceIds.length > 0) {
      const { data: pData, error: pErr } = await client
        .from("payments")
        .select("target_id, amount")
        .eq("target_type", "invoice")
        .in("target_id", invoiceIds);
      if (pErr) return dbe(pErr);
      paymentsByInvoice = ((pData ?? []) as unknown as Record<string, unknown>[]).reduce<Record<string, Record<string, unknown>[]>>((acc, p) => {
        const tid = String(p.target_id ?? "");
        (acc[tid] ||= []).push(p);
        return acc;
      }, {});
    }

    const invoices = raw.map(r => {
      const amount = Number(r.amount ?? 0);
      const gst = Number(r.gst ?? 0);
      const tds = Number(r.tds ?? 0);
      const net = netReceivable(amount, gst, tds);
      const received = (paymentsByInvoice[String(r.id)] ?? []).reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.amount ?? 0), 0);
      const outstanding = Math.max(0, net - received);
      const project = r.project as { id?: string; name?: string; type?: string } | null;
      const issuedDate = r.issued_date ? String(r.issued_date) : null;
      const dueDate = r.due_date ? String(r.due_date) : null;
      return {
        id: String(r.id),
        no: String(r.no ?? ""),
        amount,
        gst,
        tds,
        status: r.status as "draft" | "sent" | "paid" | "overdue" | "cancelled",
        issuedDate,
        projectId: String(r.project_id ?? ""),
        projectName: project?.name ?? "",
        projectType: project?.type ?? null,
        netReceivable: net,
        received,
        outstanding,
        paymentStatus: paymentStatusFrom(received, net, dueDate ?? issuedDate),
      };
    });
    return ok(invoices);
  } catch (e) { return er(e); }
}

// ── Org-wide rollup ──────────────────────────────────────────────────────

export async function listOrgInvoicesWithPayments(client: TypedSupabaseClient, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<CrossInvoice[]>> {
  // Reuse listOrgInvoices - it already includes payment aggregation
  return listOrgInvoices(client, orgId, scope);
}