// SiteTrack Pro — v4 Phase G1: material requests — PO → GRN → inventory chain.
// Layer over migration 167 (material_requests table). Mirrors the
// siteOpsQueries / financeQueries pattern (client-injected Result<T>,
// camelCase mappers, pure helpers).

import { workflowNextMap } from "./workflowEngine";
import { MATERIAL_REQUEST_WORKFLOW } from "./workflowDefinitions";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type RequestStatus = "requested" | "approved" | "ordered" | "received";
export interface MaterialRequest {
  id: string; item: string; unit: string | null; qty: number; needDate: string | null;
  reason: string | null; status: RequestStatus; requestedByName: string | null;
  approvedByName: string | null; poId: string | null; notes: string | null; createdAt: string;
}
const asReqStatus = oneOf<RequestStatus>(["requested", "approved", "ordered", "received"], "requested");

/** Pure: next status in the requested → approved → ordered → received ladder (derived from the workflow register). */
export const REQUEST_NEXT: Record<RequestStatus, RequestStatus | null> = workflowNextMap(MATERIAL_REQUEST_WORKFLOW);

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  requested: "Requested", approved: "Approved", ordered: "Ordered", received: "Received",
};

/** Pure: roll up request counts by status + totals. */
export function requestTotals(rows: MaterialRequest[]): { total: number; requested: number; approved: number; ordered: number; received: number; open: number } {
  let requested = 0, approved = 0, ordered = 0, received = 0;
  for (const r of rows) {
    if (r.status === "requested") requested += 1;
    else if (r.status === "approved") approved += 1;
    else if (r.status === "ordered") ordered += 1;
    else received += 1;
  }
  const open = requested + approved + ordered;
  return { total: rows.length, requested, approved, ordered, received, open };
}

/** Pure: is this status in the open (pre-delivery) family. */
export function isOpenRequest(status: RequestStatus): boolean {
  return status === "requested" || status === "approved" || status === "ordered";
}

// ── Query mappers ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMaterialRequests(client: any, projectId: string): Promise<Result<MaterialRequest[]>> {
  try {
    const { data, error } = await client.from("material_requests")
      .select("id, item, unit, qty, need_date, reason, status, requested_by:requested_by(name), approved_by:approved_by(name), po_id, notes, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), item: String(r.item ?? ""), unit: r.unit == null ? null : String(r.unit), qty: Number(r.qty ?? 0),
      needDate: r.need_date == null ? null : String(r.need_date), reason: r.reason == null ? null : String(r.reason),
      status: asReqStatus(r.status),
      requestedByName: (r.requested_by as { name?: unknown } | null)?.name == null ? null : String((r.requested_by as { name?: unknown }).name),
      approvedByName: (r.approved_by as { name?: unknown } | null)?.name == null ? null : String((r.approved_by as { name?: unknown }).name),
      poId: r.po_id == null ? null : String(r.po_id), notes: r.notes == null ? null : String(r.notes),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createMaterialRequest(client: any, input: { projectId: string; item: string; unit?: string; qty: number; needDate?: string | null; reason?: string | null; notes?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("material_requests").insert({
      project_id: input.projectId, item: input.item, unit: input.unit || null, qty: input.qty,
      need_date: input.needDate || null, reason: input.reason || null, status: "requested", notes: input.notes || null,
    }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setMaterialRequestStatus(client: any, id: string, status: RequestStatus, approvedById?: string | null): Promise<Result<{ ok: true }>> {
  // status transitions are manager-gated in RLS; attaching the approver on
  // the first forward move
  const chain = client.from("material_requests").update({ status, ...(status === "approved" && approvedById ? { approved_by: approvedById } : {}) });
  return chainUpdate(chain, id);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chainUpdate(chain: any, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await chain.eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteMaterialRequest = (client: any, id: string) => simpleDelete(client, "material_requests", id);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function simpleDelete(client: any, table: string, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).delete().eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}