// SiteTrack Pro — task queries (v3 port, Batch 1). DB-wired to `tasks`.

import { versionedUpdateOutcome, type VersionedUpdateOptions } from "@/lib/versionedUpdate";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  assigneeName: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  /** Trigger-forced optimistic-concurrency counter (migration 238). */
  version: number;
}

export type TQResult<T> = { ok: true; data: T } | { ok: false; error: string; conflict?: boolean };

const ST: TaskStatus[] = ["pending", "in_progress", "completed"];
const PR: TaskPriority[] = ["high", "medium", "low"];
const asStatus = (v: unknown): TaskStatus => (ST.includes(v as TaskStatus) ? (v as TaskStatus) : "pending");
const asPriority = (v: unknown): TaskPriority => (PR.includes(v as TaskPriority) ? (v as TaskPriority) : "medium");

export function nextTaskStatus(s: TaskStatus): TaskStatus {
  return s === "pending" ? "in_progress" : s === "in_progress" ? "completed" : "pending";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listTasks(client: any, projectId: string): Promise<TQResult<Task[]>> {
  try {
    const { data, error } = await client
      .from("tasks")
      .select("id, title, assignee_name, due_date, priority, status, version")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      title: String(r.title ?? "Untitled"),
      assigneeName: r.assignee_name == null ? null : String(r.assignee_name),
      dueDate: r.due_date == null ? null : String(r.due_date),
      priority: asPriority(r.priority),
      status: asStatus(r.status),
      version: typeof r.version === "number" ? r.version : 1,
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { projectId: string; title: string; assigneeName?: string; dueDate?: string | null; priority?: TaskPriority },
): Promise<TQResult<{ id: string }>> {
  try {
    const { data, error } = await client.from("tasks").insert({
      project_id: input.projectId,
      title: input.title,
      ...(input.assigneeName ? { assignee_name: input.assigneeName } : {}),
      ...(input.dueDate ? { due_date: input.dueDate } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    }).select("id").single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setTaskStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  id: string,
  status: TaskStatus,
  opts?: VersionedUpdateOptions,
): Promise<TQResult<{ ok: true }>> {
  try {
    const q = client.from("tasks").update({ status }).eq("id", id);
    const guarded = opts?.expectedVersion != null;
    if (guarded) q.eq("version", opts.expectedVersion);
    const res = await (guarded ? q.select("id") : q);
    return versionedUpdateOutcome(res, guarded ? opts?.expectedVersion : undefined);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteTask(client: any, id: string): Promise<TQResult<{ ok: true }>> {
  try {
    const { error } = await client.from("tasks").delete().eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
