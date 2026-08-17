// SiteTrack Pro — v4 Phase G2: construction quality — corrective actions.
// Layer over migration 168. Mirrors the siteOpsQueries pattern
// (client-injected Result<T>, camelCase mappers, pure helpers).

import { workflowNextMap } from "./workflowEngine";
import { CORRECTIVE_ACTION_WORKFLOW } from "./workflowDefinitions";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type CorrectivePriority = "low" | "medium" | "high" | "critical";
export type CorrectiveStatus = "open" | "in_progress" | "resolved" | "verified";
export interface CorrectiveAction {
  id: string; projectId: string; inspectionId: string | null; description: string;
  priority: CorrectivePriority; status: CorrectiveStatus; assignedTo: string | null;
  dueDate: string | null; openedByName: string | null; openedAt: string;
}
const asPrio = oneOf<CorrectivePriority>(["low", "medium", "high", "critical"], "medium");
const asStatus = oneOf<CorrectiveStatus>(["open", "in_progress", "resolved", "verified"], "open");

export const CORRECTIVE_NEXT: Record<CorrectiveStatus, CorrectiveStatus | null> = workflowNextMap(CORRECTIVE_ACTION_WORKFLOW);
export const CORRECTIVE_STATUS_LABEL: Record<CorrectiveStatus, string> = {
  open: "Open", in_progress: "In progress", resolved: "Resolved", verified: "Verified",
};
export const CORRECTIVE_PRIORITY_LABEL: Record<CorrectivePriority, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

/** Pure: roll up corrective actions by status + priority. */
export function correctiveRollup(rows: CorrectiveAction[]): {
  total: number; open: number; inProgress: number; resolved: number; verified: number; critical: number; high: number;
} {
  let open = 0, inProgress = 0, resolved = 0, verified = 0, critical = 0, high = 0;
  for (const r of rows) {
    if (r.status === "open") open += 1;
    else if (r.status === "in_progress") inProgress += 1;
    else if (r.status === "resolved") resolved += 1;
    else verified += 1;
    if (r.priority === "critical") critical += 1;
    else if (r.priority === "high") high += 1;
  }
  return { total: rows.length, open, inProgress, resolved, verified, critical, high };
}

// ── Query mappers ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listCorrectiveActions(client: any, projectId: string): Promise<Result<CorrectiveAction[]>> {
  try {
    const { data, error } = await client.from("corrective_actions")
      .select("id, project_id, inspection_id, description, priority, status, assigned_to, due_date, opened_by:opened_by(name), opened_at")
      .eq("project_id", projectId)
      .order("opened_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), projectId: String(r.project_id ?? ""), inspectionId: r.inspection_id == null ? null : String(r.inspection_id),
      description: String(r.description ?? ""), priority: asPrio(r.priority), status: asStatus(r.status),
      assignedTo: r.assigned_to == null ? null : String(r.assigned_to), dueDate: r.due_date == null ? null : String(r.due_date),
      openedByName: (r.opened_by as { name?: unknown } | null)?.name == null ? null : String((r.opened_by as { name?: unknown }).name),
      openedAt: String(r.opened_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCorrectiveAction(client: any, input: { projectId: string; description: string; priority?: CorrectivePriority; assignedTo?: string; dueDate?: string | null; inspectionId?: string | null }): Promise<Result<{ id: string }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = client.from("corrective_actions").insert({
    project_id: input.projectId, description: input.description, priority: input.priority || "medium",
    assigned_to: input.assignedTo || null, due_date: input.dueDate || null, inspection_id: input.inspectionId || null, status: "open",
  });
  return chainInsert(chain);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chainInsert(chain: any): Promise<Result<{ id: string }>> {
  try { const { data, error } = await chain.select("id").single(); if (error) return dbe(error); return { ok: true, data: { id: String(data.id) } }; } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCorrectiveStatus(client: any, id: string, status: CorrectiveStatus, opts?: { verifiedBy?: string | null }): Promise<Result<{ ok: true }>> {
  const patch: Record<string, unknown> = { status };
  if (status === "verified") patch.verified_by = opts?.verifiedBy ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = client.from("corrective_actions").update(patch);
  return chainUpdate(chain, id);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chainUpdate(chain: any, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await chain.eq("id", id); if (error) return dbe(error); return { ok: true, data: { ok: true } }; } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteCorrectiveAction = (client: any, id: string) => simpleDelete(client, "corrective_actions", id);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function simpleDelete(client: any, table: string, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).delete().eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}