// SiteTrack Pro — Approvals tab (v3 port, final batch). A cross-entity
// "pending sign-off" view: aggregates change orders, RA bills and POs awaiting
// approval. Reads/writes only already-bridged tables (no new migration).

import type { Capability } from "@/auth";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export type ApprovalKind = "changeorder" | "rabill" | "po";
export type ApprovalDecision = "approved" | "rejected";
export interface PendingApproval {
  id: string;
  kind: ApprovalKind;
  ref: string;       // the human reference (CO no / RA no / PO no)
  title: string;     // description / subcontractor / vendor line
  amount: number | null;
}

const KIND_META: Record<ApprovalKind, { table: string; rejectStatus: string }> = {
  changeorder: { table: "change_orders", rejectStatus: "rejected" },
  rabill: { table: "ra_bills", rejectStatus: "rejected" },
  po: { table: "purchase_orders", rejectStatus: "cancelled" }, // POs have no 'rejected'
};

export const APPROVAL_CAP_BY_KIND: Record<ApprovalKind, Capability> = {
  changeorder: "changeorder:approve",
  rabill: "rabill:approve",
  po: "po:approve",
};

export function approvalCapabilityForKind(kind: ApprovalKind): Capability {
  return APPROVAL_CAP_BY_KIND[kind];
}

const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPendingApprovals(client: any, projectId: string): Promise<Result<PendingApproval[]>> {
  try {
    const [co, ra, po] = await Promise.all([
      client.from("change_orders").select("id, no, description, cost_impact, status").eq("project_id", projectId).eq("status", "submitted"),
      client.from("ra_bills").select("id, no, subcontractor, bill_amount, status").eq("project_id", projectId).eq("status", "submitted"),
      client.from("purchase_orders").select("id, po_no, items, amount, status").eq("project_id", projectId).eq("status", "pending"),
    ]);
    if (co.error) return er(co.error.message ?? co.error);
    if (ra.error) return er(ra.error.message ?? ra.error);
    if (po.error) return er(po.error.message ?? po.error);
    const out: PendingApproval[] = [];
    for (const r of (co.data ?? []) as Array<Record<string, unknown>>) out.push({ id: String(r.id), kind: "changeorder", ref: String(r.no ?? "CO"), title: String(r.description ?? ""), amount: n(r.cost_impact) });
    for (const r of (ra.data ?? []) as Array<Record<string, unknown>>) out.push({ id: String(r.id), kind: "rabill", ref: String(r.no ?? "RA"), title: String(r.subcontractor ?? "Sub-contractor bill"), amount: n(r.bill_amount) });
    for (const r of (po.data ?? []) as Array<Record<string, unknown>>) out.push({ id: String(r.id), kind: "po", ref: String(r.po_no ?? "PO"), title: String(r.items ?? "Purchase order"), amount: n(r.amount) });
    return ok(out);
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function decideApproval(client: any, kind: ApprovalKind, id: string, decision: ApprovalDecision): Promise<Result<{ ok: true }>> {
  try {
    const meta = KIND_META[kind];
    const status = decision === "approved" ? "approved" : meta.rejectStatus;
    const { error } = await client.from(meta.table).update({ status }).eq("id", id);
    if (error) return er(error.message ?? error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}
