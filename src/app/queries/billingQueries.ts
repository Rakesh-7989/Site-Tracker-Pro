// SiteTrack Pro — consultancy billing engine (v4 C2).
// DB: invoices (migration 142 source/period tags) + time_entries + retainers.
// Hourly invoices are generated server-side by the security-definer RPCs
// (billing:generate) so the "mark entries billed" step is atomic with the
// invoice insert — the pure helpers here drive the Billing tab's unbilled
// summary and the org Revenue view's rollups.

import type { TimeEntry } from "./timeQueries";
import type { Invoice, InvoiceSource } from "./financeQueries";
import type { Retainer } from "./retainerQueries";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

 
function mapOrgLines(raw: unknown): { id: string; description: string; qty: number; unitPrice: number; amount: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(l => {
    const r = l as Record<string, unknown>;
    return {
      id: String(r.id ?? ""), description: String(r.description ?? ""),
      qty: Number(r.qty ?? 0), unitPrice: Number(r.unit_price ?? 0), amount: Number(r.amount ?? 0),
    };
  });
}

/** Aggregate of the approved + billable + unbilled time entries in a project. */
export interface UnbilledSummary {
  hours: number;
  value: number;
  entries: number;
}

/** Per-member unbilled breakdown for the Billing tab. */
export interface UnbilledMemberRow {
  profileId: string;
  memberName: string | null;
  hours: number;
  value: number;
}

/** Approved + billable + not yet invoiced time entries (the billable pipeline). */
export function unbillableEntries(entries: TimeEntry[]): TimeEntry[] {
  return entries.filter(e => e.approvalStatus === "approved" && e.billable && !e.billed);
}

/** Pending-approval queue (time:approve). */
export function pendingApproval(entries: TimeEntry[]): TimeEntry[] {
  return entries.filter(e => e.approvalStatus === "pending");
}

/** Hours + ₹ value of the approved unbilled pipeline. Rate-less entries count hours but ₹0. */
export function unbilledSummary(entries: TimeEntry[]): UnbilledSummary {
  const eligible = unbillableEntries(entries);
  const hours = eligible.reduce((s, e) => s + (Number.isFinite(e.hours) ? e.hours : 0), 0);
  const value = eligible.reduce((s, e) => s + (e.rate != null ? (Number.isFinite(e.hours) ? e.hours : 0) * e.rate : 0), 0);
  return { hours, value, entries: eligible.length };
}

/** Per-member unbilled summary, sorted by value desc. */
export function unbilledByMember(entries: TimeEntry[]): UnbilledMemberRow[] {
  const byProfile = new Map<string, { memberName: string | null; hours: number; value: number }>();
  for (const e of unbillableEntries(entries)) {
    const cur = byProfile.get(e.profileId) ?? { memberName: e.memberName, hours: 0, value: 0 };
    cur.hours += Number.isFinite(e.hours) ? e.hours : 0;
    cur.value += e.rate != null && Number.isFinite(e.hours) ? e.hours * e.rate : 0;
    if (!byProfile.has(e.profileId)) byProfile.set(e.profileId, cur);
  }
  return [...byProfile.entries()]
    .map(([profileId, v]) => ({ profileId, memberName: v.memberName, hours: v.hours, value: v.value }))
    .sort((a, b) => b.value - a.value);
}

/** Total invoice value excluding cancelled (whole ₹). */
export function billedToDate(invoices: Invoice[]): number {
  return invoices.filter(i => i.status !== "cancelled").reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0);
}

/** Invoiced value restricted to one source (hourly / retainer / phase). */
export function billedBySource(invoices: Invoice[], source: InvoiceSource): number {
  return invoices.filter(i => i.status !== "cancelled" && i.source === source)
    .reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0);
}

/** Monthly recurring value of active retainers (whole ₹). */
export function retainerMrr(retainers: Retainer[]): number {
  return retainers.filter(r => r.status === "active")
    .reduce((s, r) => s + (Number.isFinite(r.monthlyAmount) ? r.monthlyAmount : 0), 0);
}

/** Invoice row with its project id, for the org Revenue view. */
export interface OrgInvoiceRow extends Invoice {
  projectId: string;
}

/** Org-wide invoices for a project id list (Revenue view). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgInvoices(client: any, projectIds: readonly string[]): Promise<Result<OrgInvoiceRow[]>> {
  try {
    if (projectIds.length === 0) return ok([]);
    const { data, error } = await client
      .from("invoices")
      .select("id, no, amount, gst, tds, status, issued_date, source, period_from, period_to, retainer_id, phase_id, project_id, invoice_lines(id, description, qty, unit_price, amount)")
      .in("project_id", projectIds)
      .order("issued_date", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), no: String(r.no ?? ""), amount: Number(r.amount ?? 0),
      gst: Number(r.gst ?? 0), tds: Number(r.tds ?? 0),
      status: (["sent", "paid", "overdue", "cancelled"] as const).includes(r.status as Invoice["status"])
        ? r.status as Invoice["status"] : "sent",
      issuedDate: r.issued_date == null ? null : String(r.issued_date),
      source: r.source === "phase" || r.source === "hourly" || r.source === "retainer" ? r.source : null,
      periodFrom: r.period_from == null ? null : String(r.period_from),
      periodTo: r.period_to == null ? null : String(r.period_to),
      retainerId: r.retainer_id == null ? null : String(r.retainer_id),
      phaseId: r.phase_id == null ? null : String(r.phase_id),
      projectId: String(r.project_id ?? ""),
      lines: mapOrgLines(r.invoice_lines),
    })));
  } catch (e) { return er(e); }
}

/** Org-wide retainers for a project id list (Revenue view). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgRetainers(client: any, projectIds: readonly string[]): Promise<Result<Retainer[]>> {
  try {
    if (projectIds.length === 0) return ok([]);
    const { data, error } = await client
      .from("retainers")
      .select("id, project_id, title, monthly_amount, status, start_date, end_date, billing_day, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      title: String(r.title ?? ""),
      monthlyAmount: Number(r.monthly_amount ?? 0),
      status: (["active", "paused", "cancelled"] as const).includes(r.status as Retainer["status"])
        ? r.status as Retainer["status"] : "active",
      startDate: String(r.start_date ?? ""),
      endDate: r.end_date == null ? null : String(r.end_date),
      billingDay: Number(r.billing_day ?? 1),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Generate an hourly invoice via RPC; returns the new invoice id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateHourlyInvoice(client: any, input: {
  projectId: string; periodFrom: string; periodTo: string;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.rpc("generate_hourly_invoice", {
      p_project_id: input.projectId, p_from: input.periodFrom, p_to: input.periodTo,
    });
    if (error) return dbe(error);
    return ok({ id: String(data) });
  } catch (e) { return er(e); }
}

/** Generate a retainer invoice via RPC; returns the new invoice id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateRetainerInvoice(client: any, input: {
  retainerId: string; periodFrom: string; periodTo: string;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.rpc("generate_retainer_invoice", {
      p_retainer_id: input.retainerId, p_from: input.periodFrom, p_to: input.periodTo,
    });
    if (error) return dbe(error);
    return ok({ id: String(data) });
  } catch (e) { return er(e); }
}
