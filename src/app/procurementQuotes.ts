// SiteTrack Pro — procurement quote-comparison register (v4 D5).
// DB: procurement_quotes (migration 153). ORG-scoped (not project-scoped) so
// org-tier VENDORS (who have no project membership per migration 132) can
// submit quotes without seeing project internals. RLS: read = any org member;
// insert = org-tier "vendor" OR manager set; update/delete = managers only.
// UI gating via the procurement:view capability + plan gate (PlanFeature
// "procurement", Business+).

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type QuoteStatus = "requested" | "received" | "selected" | "rejected";
export const QUOTE_STATUSES: readonly QuoteStatus[] = ["requested", "received", "selected", "rejected"];
const asStatus = oneOf<QuoteStatus>(QUOTE_STATUSES, "requested");

export interface ProcurementQuote {
  id: string;
  orgId: string;
  ffeEntryId: string | null;
  projectId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  itemName: string | null;
  unitPrice: number;
  qty: number;
  leadDays: number | null;
  validUntil: string | null;
  status: QuoteStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Line total for a quote: qty × unit price. */
export function quoteTotal(q: Pick<ProcurementQuote, "qty" | "unitPrice">): number {
  return Math.max(1, Number(q.qty) || 1) * (Number(q.unitPrice) || 0);
}

/** A quote is comparable once marked received and not yet expired/rejected. */
export function isComparable(q: ProcurementQuote, today: string): boolean {
  if (q.status !== "received") return false;
  if (!q.validUntil) return true;
  const t = new Date(today + "T00:00:00");
  const v = new Date(q.validUntil + "T00:00:00");
  if (Number.isNaN(t.getTime()) || Number.isNaN(v.getTime())) return true;
  return v >= t;
}

/**
 * Best (cheapest, qty-adjusted) comparable quote. Honors valid_until: any
 * comparable quote not past its expiry competes; the lowest total wins. Ties
 * resolve to the first received quote. Returns null when nothing is comparable.
 */
export function bestQuote(quotes: ProcurementQuote[], today: string): ProcurementQuote | null {
  let best: ProcurementQuote | null = null;
  for (const q of quotes) {
    if (!isComparable(q, today)) continue;
    if (best === null || quoteTotal(q) < quoteTotal(best)) best = q;
  }
  return best;
}

/** The next status when the manager advances a quote (status FSM). */
export const QUOTE_NEXT: Record<QuoteStatus, QuoteStatus> = {
  requested: "received",
  received: "selected",
  selected: "rejected",
  rejected: "received",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgQuotes(client: any, orgId: string): Promise<Result<ProcurementQuote[]>> {
  try {
    const { data, error } = await client
      .from("procurement_quotes")
      .select("id, org_id, ffe_entry_id, project_id, vendor_id, vendor:vendor_id(name), item_name, unit_price, qty, lead_days, valid_until, status, notes, created_by, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      orgId: String(r.org_id ?? ""),
      ffeEntryId: r.ffe_entry_id == null ? null : String(r.ffe_entry_id),
      projectId: r.project_id == null ? null : String(r.project_id),
      vendorId: r.vendor_id == null ? null : String(r.vendor_id),
      vendorName: (r.vendor as { name?: unknown } | null)?.name == null ? null : String((r.vendor as { name?: unknown }).name),
      itemName: r.item_name == null ? null : String(r.item_name),
      unitPrice: Number(r.unit_price ?? 0),
      qty: Number(r.qty ?? 1),
      leadDays: r.lead_days == null ? null : Number(r.lead_days),
      validUntil: r.valid_until == null ? null : String(r.valid_until),
      status: asStatus(r.status),
      notes: r.notes == null ? null : String(r.notes),
      createdBy: r.created_by == null ? null : String(r.created_by),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Same shape/join as listOrgQuotes but scoped to one project (v4 D6). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectQuotes(client: any, projectId: string): Promise<Result<ProcurementQuote[]>> {
  try {
    const { data, error } = await client
      .from("procurement_quotes")
      .select("id, org_id, ffe_entry_id, project_id, vendor_id, vendor:vendor_id(name), item_name, unit_price, qty, lead_days, valid_until, status, notes, created_by, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      orgId: String(r.org_id ?? ""),
      ffeEntryId: r.ffe_entry_id == null ? null : String(r.ffe_entry_id),
      projectId: r.project_id == null ? null : String(r.project_id),
      vendorId: r.vendor_id == null ? null : String(r.vendor_id),
      vendorName: (r.vendor as { name?: unknown } | null)?.name == null ? null : String((r.vendor as { name?: unknown }).name),
      itemName: r.item_name == null ? null : String(r.item_name),
      unitPrice: Number(r.unit_price ?? 0),
      qty: Number(r.qty ?? 1),
      leadDays: r.lead_days == null ? null : Number(r.lead_days),
      validUntil: r.valid_until == null ? null : String(r.valid_until),
      status: asStatus(r.status),
      notes: r.notes == null ? null : String(r.notes),
      createdBy: r.created_by == null ? null : String(r.created_by),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertQuote(client: any, input: {
  id?: string | null;
  orgId: string;
  ffeEntryId?: string | null;
  projectId?: string | null;
  vendorId?: string | null;
  itemName?: string | null;
  unitPrice: number;
  qty?: number;
  leadDays?: number | null;
  validUntil?: string | null;
  status?: QuoteStatus;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      org_id: input.orgId,
      ffe_entry_id: input.ffeEntryId ?? null,
      project_id: input.projectId ?? null,
      vendor_id: input.vendorId ?? null,
      item_name: input.itemName ?? null,
      unit_price: Math.max(0, Number(input.unitPrice) || 0),
      qty: Math.max(1, Number(input.qty) || 1),
      lead_days: input.leadDays ?? null,
      valid_until: input.validUntil ?? null,
      status: input.status ?? "requested",
      notes: input.notes ?? null,
    };
    if (input.id) {
      const { error } = await client.from("procurement_quotes").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("procurement_quotes").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

/** Attach an unassigned quote to a project FF&E entry (manager op). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function attachQuote(client: any, id: string, projectId: string, ffeEntryId: string, status: QuoteStatus = "received"): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("procurement_quotes")
      .update({ project_id: projectId, ffe_entry_id: ffeEntryId, status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setQuoteStatus(client: any, id: string, status: QuoteStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("procurement_quotes").update({ status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteQuote(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("procurement_quotes").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Org project lister (RLS-gated to the caller's member projects) ────────
export interface OrgProjectBrief { id: string; name: string; type: string | null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgProjects(client: any, orgId: string, types?: readonly string[]): Promise<Result<OrgProjectBrief[]>> {
  try {
    let q = client.from("projects").select("id, name, type").eq("org_id", orgId);
    if (types && types.length > 0) q = q.in("type", [...types]);
    const { data, error } = await q.order("name", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), type: r.type == null ? null : String(r.type),
    })));
  } catch (e) { return er(e); }
}