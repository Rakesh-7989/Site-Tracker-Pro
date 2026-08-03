// SiteTrack Pro — consultancy fixed-fee phases (v4 C1).
// DB: fee_phases (migration 138). RLS: read = project member,
// write = phase:manage (pm / project_admin / design_head /
// consultant_head / orgadmin / superadmin). UI gating via phase:manage.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type PhaseStatus = "draft" | "approved" | "in_progress" | "completed" | "cancelled";
export const PHASE_STATUSES: readonly PhaseStatus[] = ["draft", "approved", "in_progress", "completed", "cancelled"];
const asPhaseStatus = oneOf<PhaseStatus>(PHASE_STATUSES, "draft");

export interface FeePhase {
  id: string;
  title: string;
  scope: string | null;
  feeAmount: number;      // whole ₹
  status: PhaseStatus;
  dueDate: string | null;
  completedDate: string | null;
  sortOrder: number;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listFeePhases(client: any, projectId: string): Promise<Result<FeePhase[]>> {
  try {
    const { data, error } = await client
      .from("fee_phases")
      .select("id, title, scope, fee_amount, status, due_date, completed_date, sort_order, created_at")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      scope: r.scope == null ? null : String(r.scope),
      feeAmount: Number(r.fee_amount ?? 0),
      status: asPhaseStatus(r.status),
      dueDate: r.due_date == null ? null : String(r.due_date),
      completedDate: r.completed_date == null ? null : String(r.completed_date),
      sortOrder: Number(r.sort_order ?? 0),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createFeePhase(client: any, input: {
  projectId: string; title: string; scope?: string | null;
  feeAmount?: number; status?: PhaseStatus; dueDate?: string | null; sortOrder?: number;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("fee_phases")
      .insert({
        project_id: input.projectId, title: input.title, scope: input.scope ?? null,
        fee_amount: Math.round(input.feeAmount ?? 0), status: input.status ?? "draft",
        due_date: input.dueDate || null, sort_order: input.sortOrder ?? 0,
      })
      .select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateFeePhase(client: any, id: string, patch: {
  title?: string; scope?: string | null; feeAmount?: number; status?: PhaseStatus;
  dueDate?: string | null; completedDate?: string | null; sortOrder?: number;
}): Promise<Result<{ ok: true }>> {
  try {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.scope !== undefined) row.scope = patch.scope;
    if (patch.feeAmount !== undefined) row.fee_amount = Math.round(patch.feeAmount);
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
    if (patch.completedDate !== undefined) row.completed_date = patch.completedDate;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await client.from("fee_phases").update(row).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setFeePhaseStatus(client: any, id: string, status: PhaseStatus): Promise<Result<{ ok: true }>> {
  return updateFeePhase(client, id, { status, completedDate: status === "completed" ? new Date().toISOString().slice(0, 10) : undefined });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteFeePhase(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("fee_phases").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Sum of committed phase fees (approved + in_progress + completed). */
export function committedFee(phases: FeePhase[]): number {
  return phases
    .filter(p => p.status === "approved" || p.status === "in_progress" || p.status === "completed")
    .reduce((s, p) => s + (Number.isFinite(p.feeAmount) ? p.feeAmount : 0), 0);
}
