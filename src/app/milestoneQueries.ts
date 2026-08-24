// SiteTrack Pro — milestone queries (v3 port, Batch 1). DB-wired to the
// `milestones` table (GRANT + RLS via migration 72).

import { versionedUpdateOutcome, type VersionedUpdateOptions } from "@/lib/versionedUpdate";

export type MilestoneStatus = "pending" | "in_progress" | "completed";

export interface Milestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  dueDate: string | null;
  completedDate: string | null;
  sortOrder: number;
  /** Trigger-forced optimistic-concurrency counter (migration 238). */
  version: number;
}

export type MQResult<T> = { ok: true; data: T } | { ok: false; error: string };

const STATUSES: MilestoneStatus[] = ["pending", "in_progress", "completed"];
const asStatus = (v: unknown): MilestoneStatus => (STATUSES.includes(v as MilestoneStatus) ? (v as MilestoneStatus) : "pending");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMilestones(client: any, projectId: string): Promise<MQResult<Milestone[]>> {
  try {
    const { data, error } = await client
      .from("milestones")
      .select("id, title, status, due_date, completed_date, sort_order, version")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      title: String(r.title ?? "Untitled"),
      status: asStatus(r.status),
      dueDate: r.due_date == null ? null : String(r.due_date),
      completedDate: r.completed_date == null ? null : String(r.completed_date),
      sortOrder: Number(r.sort_order ?? 0),
      version: typeof r.version === "number" ? r.version : 1,
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createMilestone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { projectId: string; title: string; dueDate?: string | null; sortOrder?: number },
): Promise<MQResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("milestones")
      .insert({
        project_id: input.projectId,
        title: input.title,
        ...(input.dueDate ? { due_date: input.dueDate } : {}),
        ...(input.sortOrder != null ? { sort_order: input.sortOrder } : {}),
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setMilestoneStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  id: string,
  status: MilestoneStatus,
  opts?: VersionedUpdateOptions,
): Promise<MQResult<{ ok: true }>> {
  try {
    const patch: Record<string, unknown> = { status };
    patch.completed_date = status === "completed" ? new Date().toISOString().slice(0, 10) : null;
    const q = client.from("milestones").update(patch).eq("id", id);
    const guarded = opts?.expectedVersion != null;
    if (guarded) q.eq("version", opts.expectedVersion);
    const res = await (guarded ? q.select("id") : q);
    return versionedUpdateOutcome(res, guarded ? opts?.expectedVersion : undefined);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pure helper: the next status in the pending → in_progress → completed cycle. */
export function nextStatus(s: MilestoneStatus): MilestoneStatus {
  return s === "pending" ? "in_progress" : s === "in_progress" ? "completed" : "pending";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteMilestone(client: any, id: string): Promise<MQResult<{ ok: true }>> {
  try {
    const { error } = await client.from("milestones").delete().eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
