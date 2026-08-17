// SiteTrack Pro — statutory approvals / NOC register (v4 D4).
// DB: statutory_approvals (migration 152). RLS: read = project member;
// insert/update/delete = managers + org admin only (statutory:manage). UI
// gating via the statutory:manage capability + plan gate (PlanFeature
// "statutory"). Status transitions are derived from the workflow register
// (STATUTORY_WORKFLOW) so the register is the single source of truth.

import { workflowNextMap } from "./workflowEngine";
import { STATUTORY_WORKFLOW } from "./workflowDefinitions";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type StatutoryKind = "fire" | "municipal" | "environment" | "electrical" | "labour" | "occupancy" | "other";
export const STATUTORY_KINDS: readonly StatutoryKind[] = ["fire", "municipal", "environment", "electrical", "labour", "occupancy", "other"];
const asKind = oneOf<StatutoryKind>(STATUTORY_KINDS, "other");

export type StatutoryStatus = "draft" | "applied" | "approved" | "rejected" | "expired";
export const STATUTORY_STATUSES: readonly StatutoryStatus[] = ["draft", "applied", "approved", "rejected", "expired"];
const asStatus = oneOf<StatutoryStatus>(STATUTORY_STATUSES, "draft");

/** Pure: next status in the statutory ladder (derived from the workflow register). */
export const STATUTORY_NEXT: Record<StatutoryStatus, StatutoryStatus | null> = workflowNextMap(STATUTORY_WORKFLOW);

export interface StatutoryApproval {
  id: string;
  kind: StatutoryKind;
  title: string;
  authority: string | null;
  refNo: string | null;
  appliedAt: string | null;
  status: StatutoryStatus;
  decisionAt: string | null;
  validUntil: string | null;
  cost: number;
  notes: string | null;
  createdAt: string;
}

/** Whether a date is within `days` days of today (for renewal/expiry highlight). */
export function isExpiring(validUntil: string | null, today: string, days = 30): boolean {
  if (!validUntil) return false;
  const t = new Date(today + "T00:00:00");
  const v = new Date(validUntil + "T00:00:00");
  if (Number.isNaN(t.getTime()) || Number.isNaN(v.getTime())) return false;
  if (v < t) return false;
  const diff = v.getTime() - t.getTime();
  return diff <= days * 86400000;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listStatutoryApprovals(client: any, projectId: string): Promise<Result<StatutoryApproval[]>> {
  try {
    const { data, error } = await client
      .from("statutory_approvals")
      .select("id, kind, title, authority, ref_no, applied_at, status, decision_at, valid_until, cost, notes, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      kind: asKind(r.kind),
      title: String(r.title ?? ""),
      authority: r.authority == null ? null : String(r.authority),
      refNo: r.ref_no == null ? null : String(r.ref_no),
      appliedAt: r.applied_at == null ? null : String(r.applied_at),
      status: asStatus(r.status),
      decisionAt: r.decision_at == null ? null : String(r.decision_at),
      validUntil: r.valid_until == null ? null : String(r.valid_until),
      cost: Number(r.cost ?? 0),
      notes: r.notes == null ? null : String(r.notes),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertStatutoryApproval(client: any, input: {
  id?: string | null;
  projectId: string;
  kind?: StatutoryKind;
  title: string;
  authority?: string | null;
  refNo?: string | null;
  appliedAt?: string | null;
  status?: StatutoryStatus;
  decisionAt?: string | null;
  validUntil?: string | null;
  cost?: number;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      project_id: input.projectId,
      kind: input.kind ?? "other",
      title: input.title,
      authority: input.authority ?? null,
      ref_no: input.refNo ?? null,
      applied_at: input.appliedAt ?? null,
      status: input.status ?? "draft",
      decision_at: input.decisionAt ?? null,
      valid_until: input.validUntil ?? null,
      cost: input.cost ?? 0,
      notes: input.notes ?? null,
    };
    if (input.id) {
      const { error } = await client.from("statutory_approvals").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("statutory_approvals").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setStatutoryStatus(client: any, id: string, status: StatutoryStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("statutory_approvals").update({ status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteStatutoryApproval(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("statutory_approvals").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}
