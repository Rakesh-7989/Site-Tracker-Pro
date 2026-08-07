// SiteTrack Pro — persisted per-project design-workflow stage (v4 Phase E Opt2).
// Backed by migration 165 `design_workflow`. Manager/orgadmin write via RLS
// (mirrors 163). stage_order stays within the 0–6 canonical ladder defined by
// src/app/designWorkflow.ts DESIGN_STAGES.

import { DESIGN_STAGES, designStageIndex, type DesignStageId } from "@/app/designWorkflow";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const MAX_DESIGN_STAGE_ORDER = DESIGN_STAGES.length - 1;

/** Map any 0–6 RAID order to a canonical stage id (clamped to the ladder). */
export function designStageFromOrder(order: number): DesignStageId {
  const clamped = Math.min(Math.max(Math.round(order || 0), 0), MAX_DESIGN_STAGE_ORDER);
  return DESIGN_STAGES[clamped];
}

export interface DesignWorkflowRow {
  projectId: string;
  stage: DesignStageId;
  stageOrder: number;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

function mapRow(raw: Record<string, unknown>): DesignWorkflowRow {
  const order = Number(raw.stage_order ?? 0);
  return {
    projectId: String(raw.project_id ?? ""),
    stage: designStageFromOrder(order),
    stageOrder: order,
    reviewNote: raw.review_note == null ? null : String(raw.review_note),
    reviewedBy: raw.reviewed_by == null ? null : String(raw.reviewed_by),
    reviewedAt: raw.reviewed_at == null ? null : String(raw.reviewed_at),
    approvedBy: raw.approved_by == null ? null : String(raw.approved_by),
    approvedAt: raw.approved_at == null ? null : String(raw.approved_at),
  };
}

const ROW_SELECT = "project_id, stage_order, review_note, reviewed_by, reviewed_at, approved_by, approved_at";

/** Return the persisted stage row for a project (never throws; undefined when absent). */
export async function getDesignWorkflow(client: Client, projectId: string): Promise<Result<DesignWorkflowRow | null>> {
  try {
    const { data, error } = await client
      .from("design_workflow").select(ROW_SELECT).eq("project_id", projectId).maybeSingle();
    if (error) return dbe(error);
    return ok(data ? mapRow(data) : null);
  } catch (e) { return er(e); }
}

/** Upsert a workflow row for the project (insert-on-missing or create). */
export async function ensureDesignWorkflow(client: Client, projectId: string): Promise<Result<{ ok: true }>> {
  return touchDesignWorkflow(client, projectId, {});
}

/** Bump the persisted stage one step toward `target` (clamped). No-op at end. */
export async function advanceDesignWorkflow(client: Client, projectId: string, to?: DesignStageId): Promise<Result<{ ok: true }>> {
  try {
    const existingRes = await getDesignWorkflow(client, projectId);
    // fs not-ok propagates
    if (!existingRes.ok) return existingRes;
    const current = existingRes.data?.stageOrder ?? 0;
    const targetOrder = to ? designStageIndex(to) : Math.min(current + 1, MAX_DESIGN_STAGE_ORDER);
    const next = Math.max(Math.min(targetOrder, MAX_DESIGN_STAGE_ORDER), current);
    const { error } = await client.from("design_workflow").upsert(
      { project_id: projectId, stage_order: next },
      { onConflict: "project_id" },
    );
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Record a client-review note (does not change stage_order). */
export async function reviewDesignWorkflow(client: Client, projectId: string, note: string, reviewerId: string): Promise<Result<{ ok: true }>> {
  return touchDesignWorkflow(client, projectId, { review_note: note, reviewed_by: reviewerId });
}

/** Approve the design (locks at approved stage). Clears review annotations. */
export async function approveDesignWorkflow(client: Client, projectId: string, approverId: string): Promise<Result<{ ok: true }>> {
  return touchDesignWorkflow(client, projectId, { stage_order: MAX_DESIGN_STAGE_ORDER, approved_by: approverId });
}

/** Reset the workflow back to requirements (used for revisions). */
export async function resetDesignWorkflow(client: Client, projectId: string): Promise<Result<{ ok: true }>> {
  return touchDesignWorkflow(client, projectId, { stage_order: 0, review_note: null, reviewed_by: null, reviewed_at: null, approved_by: null, approved_at: null });
}

/** Low-level upsert with a merge patch; used by all mutating helpers above. */
async function touchDesignWorkflow(client: Client, projectId: string, patch: Record<string, unknown>): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client
      .from("design_workflow")
      .upsert({ project_id: projectId, stage_order: 0, ...patch }, { onConflict: "project_id" });
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}