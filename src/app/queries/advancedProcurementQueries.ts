// SiteTrack Pro — Advanced Procurement queries (v6 Phase 5).
// 3-way matching, vendor performance scorecards, PO→GRN→Invoice automation.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

export type MatchStatus = "unmatched" | "matched" | "partial" | "disputed";
export type POReceiptStatus = "pending" | "received" | "matched" | "disputed";

export interface POReceipt {
  id: string;
  poId: string;
  receivedDate: string;
  qty: number;
  unitPrice: number;
  amount: number;
  notes: string | null;
  receivedBy: string | null;
  invoiceId: string | null;
  matchStatus: MatchStatus;
  matchedAmount: number;
  matchedAt: string | null;
  matchedBy: string | null;
  createdAt: string;
}

export interface VendorPerformance {
  id: string;
  vendorId: string;
  orgId: string;
  projectId: string | null;
  // Delivery
  totalPos: number;
  onTimeDeliveries: number;
  lateDeliveries: number;
  partialDeliveries: number;
  // Quantity
  totalQtyOrdered: number;
  totalQtyDelivered: number;
  totalQtyRejected: number;
  // Quality
  qualityIssues: number;
  returnsCount: number;
  disputeCount: number;
  // Financial
  totalAmountOrdered: number;
  totalAmountDelivered: number;
  totalAmountInvoiced: number;
  avgPaymentDays: number | null;
  // Scores (0-100)
  deliveryScore: number;
  qualityScore: number;
  financialScore: number;
  overallScore: number;
  // Manual rating (1-5)
  manualRating: number | null;
  // Period
  periodStart: string;
  periodEnd: string;
  computedAt: string;
}

export interface ThreeWayMatch {
  receiptId: string;
  poId: string;
  invoiceId: string;
  matchedAmount: number;
  matchStatus: MatchStatus;
  matchedAt: string | null;
  matchedBy: string | null;
}

// ── PO Receipts (enhanced) ────────────────────────────────────────────────

function mapReceipt(r: Record<string, unknown>): POReceipt {
  return {
    id: String(r.id),
    poId: String(r.po_id),
    receivedDate: String(r.received_date),
    qty: Number(r.qty ?? 0),
    unitPrice: Number(r.unit_price ?? 0),
    amount: Number(r.amount ?? 0),
    notes: r.notes == null ? null : String(r.notes),
    receivedBy: r.received_by == null ? null : String(r.received_by),
    invoiceId: r.invoice_id == null ? null : String(r.invoice_id),
    matchStatus: String(r.match_status ?? "unmatched") as MatchStatus,
    matchedAmount: Number(r.matched_amount ?? 0),
    matchedAt: r.matched_at == null ? null : String(r.matched_at),
    matchedBy: r.matched_by == null ? null : String(r.matched_by),
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPOReceipts(client: any, poId: string): Promise<Result<POReceipt[]>> {
  try {
    const { data, error } = await client.from("po_receipts")
      .select("id, po_id, received_date, qty, unit_price, amount, notes, received_by, invoice_id, match_status, matched_amount, matched_at, matched_by, created_at")
      .eq("po_id", poId)
      .order("received_date", { ascending: false });
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapReceipt) };
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPOReceipt(client: any, input: { poId: string; receivedDate?: string; qty: number; unitPrice: number; amount: number; notes?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("po_receipts").insert({
      po_id: input.poId,
      received_date: input.receivedDate ?? null,
      qty: input.qty,
      unit_price: input.unitPrice,
      amount: input.amount,
      notes: input.notes ?? null,
    }).select("id").single();
    if (error) return dbe(error);
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePOReceipt(client: any, id: string, patch: Partial<POReceipt>): Promise<Result<{ ok: true }>> {
  try {
    const dbPatch: Record<string, unknown> = {};
    if (patch.receivedDate !== undefined) dbPatch.received_date = patch.receivedDate;
    if (patch.qty !== undefined) dbPatch.qty = patch.qty;
    if (patch.unitPrice !== undefined) dbPatch.unit_price = patch.unitPrice;
    if (patch.amount !== undefined) dbPatch.amount = patch.amount;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.invoiceId !== undefined) dbPatch.invoice_id = patch.invoiceId;
    if (patch.matchStatus !== undefined) dbPatch.match_status = patch.matchStatus;
    if (patch.matchedAmount !== undefined) dbPatch.matched_amount = patch.matchedAmount;
    if (patch.matchedAt !== undefined) dbPatch.matched_at = patch.matchedAt;
    if (patch.matchedBy !== undefined) dbPatch.matched_by = patch.matchedBy;
    const { error } = await client.from("po_receipts").update(dbPatch).eq("id", id);
    if (error) return dbe(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return er(e); }
}

// ── 3-Way Matching ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function matchReceiptToInvoice(client: any, receiptId: string, invoiceId: string, matchedAmount: number): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.rpc("match_po_receipt_to_invoice", {
      p_receipt_id: receiptId,
      p_invoice_id: invoiceId,
      p_matched_amount: matchedAmount,
    });
    if (error) return dbe(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUnmatchedReceipts(client: any, projectId: string): Promise<Result<POReceipt[]>> {
  try {
    const { data, error } = await client.from("po_receipts")
      .select("id, po_id, received_date, qty, unit_price, amount, notes, received_by, invoice_id, match_status, matched_amount, matched_at, matched_by, created_at, purchase_orders!inner(project_id)")
      .eq("purchase_orders.project_id", projectId)
      .neq("match_status", "matched")
      .order("received_date", { ascending: false });
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapReceipt) };
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMatchedReceipts(client: any, invoiceId: string): Promise<Result<POReceipt[]>> {
  try {
    const { data, error } = await client.from("po_receipts")
      .select("id, po_id, received_date, qty, unit_price, amount, notes, received_by, invoice_id, match_status, matched_amount, matched_at, matched_by, created_at")
      .eq("invoice_id", invoiceId)
      .order("received_date", { ascending: false });
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapReceipt) };
  } catch (e) { return er(e); }
}

// ── Vendor Performance Scorecards ────────────────────────────────────────

function mapVendorPerf(r: Record<string, unknown>): VendorPerformance {
  return {
    id: String(r.id),
    vendorId: String(r.vendor_id),
    orgId: String(r.org_id),
    projectId: r.project_id == null ? null : String(r.project_id),
    totalPos: Number(r.total_pos ?? 0),
    onTimeDeliveries: Number(r.on_time_deliveries ?? 0),
    lateDeliveries: Number(r.late_deliveries ?? 0),
    partialDeliveries: Number(r.partial_deliveries ?? 0),
    totalQtyOrdered: Number(r.total_qty_ordered ?? 0),
    totalQtyDelivered: Number(r.total_qty_delivered ?? 0),
    totalQtyRejected: Number(r.total_qty_rejected ?? 0),
    qualityIssues: Number(r.quality_issues ?? 0),
    returnsCount: Number(r.returns_count ?? 0),
    disputeCount: Number(r.dispute_count ?? 0),
    totalAmountOrdered: Number(r.total_amount_ordered ?? 0),
    totalAmountDelivered: Number(r.total_amount_delivered ?? 0),
    totalAmountInvoiced: Number(r.total_amount_invoiced ?? 0),
    avgPaymentDays: r.avg_payment_days == null ? null : Number(r.avg_payment_days),
    deliveryScore: Number(r.delivery_score ?? 0),
    qualityScore: Number(r.quality_score ?? 0),
    financialScore: Number(r.financial_score ?? 0),
    overallScore: Number(r.overall_score ?? 0),
    manualRating: r.manual_rating == null ? null : Number(r.manual_rating),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    computedAt: String(r.computed_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listVendorPerformance(client: any, orgId: string, projectId?: string): Promise<Result<VendorPerformance[]>> {
  try {
    let query = client.from("vendor_performance")
      .select("id, vendor_id, org_id, project_id, total_pos, on_time_deliveries, late_deliveries, partial_deliveries, total_qty_ordered, total_qty_delivered, total_qty_rejected, quality_issues, returns_count, dispute_count, total_amount_ordered, total_amount_delivered, total_amount_invoiced, avg_payment_days, delivery_score, quality_score, financial_score, overall_score, manual_rating, period_start, period_end, computed_at")
      .eq("org_id", orgId)
      .order("period_start", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapVendorPerf) };
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getVendorPerformance(client: any, vendorId: string, orgId: string, projectId?: string): Promise<Result<VendorPerformance | null>> {
  try {
    let query = client.from("vendor_performance")
      .select("id, vendor_id, org_id, project_id, total_pos, on_time_deliveries, late_deliveries, partial_deliveries, total_qty_ordered, total_qty_delivered, total_qty_rejected, quality_issues, returns_count, dispute_count, total_amount_ordered, total_amount_delivered, total_amount_invoiced, avg_payment_days, delivery_score, quality_score, financial_score, overall_score, manual_rating, period_start, period_end, computed_at")
      .eq("vendor_id", vendorId)
      .eq("org_id", orgId)
      .order("period_start", { ascending: false })
      .limit(1);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) return dbe(error);
    return { ok: true, data: (data as Array<Record<string, unknown>>).length > 0 ? mapVendorPerf(data[0]) : null };
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recomputeVendorPerformance(client: any, vendorId: string, orgId: string, projectId: string | null, periodStart: string, periodEnd: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.rpc("recompute_vendor_performance", {
      p_vendor_id: vendorId,
      p_org_id: orgId,
      p_project_id: projectId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    if (error) return dbe(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recomputeAllVendorPerformance(client: any, orgId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.rpc("recompute_all_vendor_performance", { p_org_id: orgId });
    if (error) return dbe(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return er(e); }
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function vendorPerformanceTier(score: number): { tier: "A" | "B" | "C" | "D"; label: string; color: string } {
  if (score >= 85) return { tier: "A", label: "Preferred", color: "success" };
  if (score >= 70) return { tier: "B", label: "Approved", color: "info" };
  if (score >= 50) return { tier: "C", label: "Conditional", color: "warning" };
  return { tier: "D", label: "At Risk", color: "danger" };
}

export function deliveryTrend(current: number, previous: number): "improving" | "stable" | "declining" {
  const diff = current - previous;
  if (diff > 2) return "improving";
  if (diff < -2) return "declining";
  return "stable";
}