// SiteTrack Pro - milestone queries (v3 port, Batch 1). DB-wired to the
// `milestones` table (GRANT + RLS via migration 72).
//
// P1-C reference conversion: the client is TypedSupabaseClient, so column
// names in select/insert/update/eq are checked against the live schema.

import { versionedUpdateOutcome, type VersionedUpdateOptions } from "@/lib/versionedUpdate";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

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

export type MQResult<T> = { ok: true; data: T } | { ok: false; error: string; conflict?: boolean };

const STATUSES: MilestoneStatus[] = ["pending", "in_progress", "completed"];
const asStatus = (v: unknown): MilestoneStatus => (STATUSES.includes(v as MilestoneStatus) ? (v as MilestoneStatus) : "pending");

export async function listMilestones(client: TypedSupabaseClient, projectId: string): Promise<MQResult<Milestone[]>> {
  try {
    const { data, error } = await client
      .from("milestones")
      .select("id, title, status, due_date, completed_date, sort_order, version")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []).map(r => ({
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
  client: TypedSupabaseClient,
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
  client: TypedSupabaseClient,
  id: string,
  status: MilestoneStatus,
  opts?: VersionedUpdateOptions,
): Promise<MQResult<{ ok: true }>> {
  try {
    const patch = {
      status,
      completed_date: status === "completed" ? new Date().toISOString().slice(0, 10) : null,
    };
    const q = client.from("milestones").update(patch).eq("id", id);
    const expected = opts?.expectedVersion;
    const guarded = expected != null;
    if (guarded && expected != null) q.eq("version", expected);
    const res = await (guarded ? q.select("id") : q);
    return versionedUpdateOutcome(
      res as unknown as { data: unknown; error: { message?: string } | null },
      guarded ? opts?.expectedVersion : undefined,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pure helper: the next status in the pending → in_progress → completed cycle. */
export function nextStatus(s: MilestoneStatus): MilestoneStatus {
  return s === "pending" ? "in_progress" : s === "in_progress" ? "completed" : "pending";
}

export async function deleteMilestone(client: TypedSupabaseClient, id: string): Promise<MQResult<{ ok: true }>> {
  try {
    const { error } = await client.from("milestones").delete().eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
