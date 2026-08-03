// SiteTrack Pro — consultancy deliverables + design review rounds (v4 C1).
// DB: deliverables + review_rounds (migration 139). RLS: read = project
// member; manage = members (deliverable:manage / review:comment); approve +
// close = managers (deliverable:approve / review:manage). UI gating via the
// corresponding capabilities.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type DocType = "drawing" | "spec" | "report" | "model" | "schedule" | "certificate" | "other";
export const DOC_TYPES: readonly DocType[] = ["drawing", "spec", "report", "model", "schedule", "certificate", "other"];
const asDocType = oneOf<DocType>(DOC_TYPES, "other");

export type DeliverableStatus = "draft" | "in_review" | "approved" | "rejected" | "issued";
export const DELIVERABLE_STATUSES: readonly DeliverableStatus[] = ["draft", "in_review", "approved", "rejected", "issued"];
const asDelStatus = oneOf<DeliverableStatus>(DELIVERABLE_STATUSES, "draft");

export type ReviewRoundStatus = "open" | "closed";
const asRoundStatus = oneOf<ReviewRoundStatus>(["open", "closed"], "open");

export interface Deliverable {
  id: string;
  phaseId: string | null;
  title: string;
  docType: DocType;
  status: DeliverableStatus;
  dueDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
}

export interface ReviewRound {
  id: string;
  roundNo: number;
  status: ReviewRoundStatus;
  requestedBy: string | null;
  requestedByName: string | null;
  comments: string | null;
  closedBy: string | null;
  closedByName: string | null;
  closedAt: string | null;
  createdAt: string;
}

// ── Deliverables ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listDeliverables(client: any, projectId: string): Promise<Result<Deliverable[]>> {
  try {
    const { data, error } = await client
      .from("deliverables")
      .select("id, phase_id, title, doc_type, status, due_date, owner_id, created_at, profiles(name)")
      .eq("project_id", projectId)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      phaseId: r.phase_id == null ? null : String(r.phase_id),
      title: String(r.title ?? ""),
      docType: asDocType(r.doc_type),
      status: asDelStatus(r.status),
      dueDate: r.due_date == null ? null : String(r.due_date),
      ownerId: r.owner_id == null ? null : String(r.owner_id),
      ownerName: (r.profiles as { name?: string } | null | undefined)?.name ?? null,
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createDeliverable(client: any, input: {
  projectId: string; title: string; docType?: DocType; phaseId?: string | null;
  dueDate?: string | null; ownerId?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("deliverables")
      .insert({
        project_id: input.projectId, title: input.title, doc_type: input.docType ?? "other",
        phase_id: input.phaseId ?? null, due_date: input.dueDate || null, owner_id: input.ownerId ?? null,
      })
      .select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateDeliverable(client: any, id: string, patch: {
  title?: string; docType?: DocType; phaseId?: string | null; dueDate?: string | null;
  ownerId?: string | null; status?: DeliverableStatus;
}): Promise<Result<{ ok: true }>> {
  try {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.docType !== undefined) row.doc_type = patch.docType;
    if (patch.phaseId !== undefined) row.phase_id = patch.phaseId;
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
    if (patch.ownerId !== undefined) row.owner_id = patch.ownerId;
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await client.from("deliverables").update(row).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setDeliverableStatus = (client: any, id: string, status: DeliverableStatus) =>
  updateDeliverable(client, id, { status });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteDeliverable(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("deliverables").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Review rounds ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listReviewRounds(client: any, deliverableId: string): Promise<Result<ReviewRound[]>> {
  try {
    const { data, error } = await client
      .from("review_rounds")
      .select("id, round_no, status, requested_by, comments, closed_by, closed_at, created_at, req_profiles(name), closed_profiles(name)")
      .eq("deliverable_id", deliverableId)
      .order("round_no", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      roundNo: Number(r.round_no ?? 0),
      status: asRoundStatus(r.status),
      requestedBy: r.requested_by == null ? null : String(r.requested_by),
      requestedByName: (r.req_profiles as { name?: string } | null | undefined)?.name ?? null,
      comments: r.comments == null ? null : String(r.comments),
      closedBy: r.closed_by == null ? null : String(r.closed_by),
      closedByName: (r.closed_profiles as { name?: string } | null | undefined)?.name ?? null,
      closedAt: r.closed_at == null ? null : String(r.closed_at),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Next round number for a deliverable = max(round_no)+1 (1 when none). */
export function nextRoundNo(rounds: ReviewRound[]): number {
  return rounds.reduce((m, r) => Math.max(m, r.roundNo), 0) + 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createReviewRound(client: any, input: {
  deliverableId: string; roundNo: number; requestedBy?: string | null; comments?: string;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("review_rounds")
      .insert({
        deliverable_id: input.deliverableId, round_no: input.roundNo,
        requested_by: input.requestedBy ?? null, comments: input.comments ?? null,
      })
      .select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function closeReviewRound(client: any, id: string, closedBy: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("review_rounds").update({
      status: "closed", closed_by: closedBy, closed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}
