// SiteTrack Pro — design/contract queries (v3 port, Batch 4). DB-wired to
// drawings / rfi via the migration 72/75 bridge.
//
// Drawing revision governance (ST-016): the DB auto-supersedes via the
// trg_drawings_auto_supersede trigger (migration 212) when a newer
// `current` revision of the same (project, title, type) is released.
// applyAutoSupersede() mirrors that rule in the optimistic UI so the
// released revision list updates instantly before a reload.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upd(client: any, table: string, id: string, patch: Record<string, unknown>): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).update(patch).eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function del(client: any, table: string, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).delete().eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}

// ── Drawings ────────────────────────────────────────────────────────────────
export type DrawingStatus = "current" | "superseded";
export interface Drawing {
  id: string;
  projectId: string;
  title: string;
  type: string;
  revision: string;
  status: DrawingStatus;
  releaseDate: string | null;
  storagePath: string | null;
  previewUrl: string | null;
  /** Per-drawing design-workflow stage (Phase E Opt3, migration 166). */
  designStage: string;
  /** id of the newer revision that superseded this row (ST-016, migration 212). */
  supersededBy: string | null;
}
const asDw = oneOf<DrawingStatus>(["current", "superseded"], "current");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listDrawings(client: any, projectId: string): Promise<Result<Drawing[]>> {
  try {
    const { data, error } = await client.from("drawings").select("id, project_id, title, type, revision, status, release_date, storage_path, preview_url, design_stage, superseded_by").eq("project_id", projectId).order("release_date", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      title: String(r.title ?? ""),
      type: String(r.type ?? ""),
      revision: String(r.revision ?? "Rev A"),
      status: asDw(r.status),
      releaseDate: r.release_date == null ? null : String(r.release_date),
      storagePath: r.storage_path == null ? null : String(r.storage_path),
      previewUrl: r.preview_url == null ? null : String(r.preview_url),
      designStage: String(r.design_stage ?? "concept"),
      supersededBy: r.superseded_by == null ? null : String(r.superseded_by),
    })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createDrawing(client: any, input: { projectId: string; title: string; type: string; revision?: string; releasedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("drawings").insert({ project_id: input.projectId, title: input.title, type: input.type, revision: input.revision || "Rev A", released_by: input.releasedBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

/**
 * ST-016 — mirror the trg_drawings_auto_supersede trigger in the optimistic UI:
 * when `added` is released as `current`, every existing row with the same
 * (projectId, title, type) at status `current` is flipped to `superseded`
 * with `supersededBy = added.id`. Pure — returns a NEW array, never mutates.
 */
export function applyAutoSupersede(rows: Drawing[], added: Drawing): Drawing[] {
  const key = (d: { projectId: string; title: string; type: string }) =>
    [d.projectId, d.title.trim().toLowerCase(), d.type.trim().toLowerCase()].join("|");
  const target = key(added);
  return rows.map(r =>
    key(r) === target && r.status === "current" && r.id !== added.id
      ? { ...r, status: "superseded" as DrawingStatus, supersededBy: added.id }
      : r,
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setDrawingStatus = (client: any, id: string, status: DrawingStatus) => upd(client, "drawings", id, { status });
/** Persist a per-drawing design-workflow stage (Phase E Opt3, migration 166). */
export const setDrawingStage = (client: any, id: string, designStage: string) => upd(client, "drawings", id, { design_stage: designStage });
/** Persist the preferred raster preview file path (migration 150) for the D2 diff overlay. */
export const setDrawingPreviewUrl = (client: any, id: string, previewUrl: string | null) => upd(client, "drawings", id, { preview_url: previewUrl });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteDrawing = (client: any, id: string) => del(client, "drawings", id);

// ── RFIs ────────────────────────────────────────────────────────────────────
export type RfiStatus = "open" | "answered" | "closed" | "overdue";
export interface Rfi { id: string; no: string; subject: string; question: string; category: string | null; status: RfiStatus; response: string | null; askedAt: string | null; }
const asRfi = oneOf<RfiStatus>(["open", "answered", "closed", "overdue"], "open");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listRfis(client: any, projectId: string): Promise<Result<Rfi[]>> {
  try {
    const { data, error } = await client.from("rfi").select("id, no, subject, question, category, status, response, asked_at").eq("project_id", projectId).order("asked_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), no: String(r.no ?? ""), subject: String(r.subject ?? ""), question: String(r.question ?? ""), category: r.category == null ? null : String(r.category), status: asRfi(r.status), response: r.response == null ? null : String(r.response), askedAt: r.asked_at == null ? null : String(r.asked_at) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createRfi(client: any, input: { projectId: string; no: string; subject: string; question: string; category?: string; askedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("rfi").insert({ project_id: input.projectId, no: input.no, subject: input.subject, question: input.question, category: input.category || null, asked_by: input.askedBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
/** Post a response → marks the RFI answered. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const respondRfi = (client: any, id: string, response: string) => upd(client, "rfi", id, { response, status: "answered" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setRfiStatus = (client: any, id: string, status: RfiStatus) => upd(client, "rfi", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteRfi = (client: any, id: string) => del(client, "rfi", id);

// ── Change Orders ───────────────────────────────────────────────────────────
export type CoStatus = "submitted" | "approved" | "rejected" | "cancelled";
export interface ChangeOrder { id: string; no: string; description: string; costImpact: number | null; scheduleImpact: number | null; reason: string | null; status: CoStatus; }
const asCo = oneOf<CoStatus>(["submitted", "approved", "rejected", "cancelled"], "submitted");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listChangeOrders(client: any, projectId: string): Promise<Result<ChangeOrder[]>> {
  try {
    const { data, error } = await client.from("change_orders").select("id, no, description, cost_impact, schedule_impact, reason, status").eq("project_id", projectId).order("raised_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), no: String(r.no ?? ""), description: String(r.description ?? ""), costImpact: r.cost_impact == null ? null : Number(r.cost_impact), scheduleImpact: r.schedule_impact == null ? null : Number(r.schedule_impact), reason: r.reason == null ? null : String(r.reason), status: asCo(r.status) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createChangeOrder(client: any, input: { projectId: string; no: string; description: string; costImpact?: number; scheduleImpact?: number; reason?: string; raisedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("change_orders").insert({ project_id: input.projectId, no: input.no, description: input.description, cost_impact: input.costImpact ?? null, schedule_impact: input.scheduleImpact ?? null, reason: input.reason || null, raised_by: input.raisedBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setCoStatus = (client: any, id: string, status: CoStatus) => upd(client, "change_orders", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteChangeOrder = (client: any, id: string) => del(client, "change_orders", id);

// ── Estimates ───────────────────────────────────────────────────────────────
export type EstimateStatus = "draft" | "submitted" | "approved" | "superseded" | "rejected";
export interface Estimate {
  id: string;
  name: string;
  version: number;
  totalAmount: number;
  status: EstimateStatus;
  /** Build-up fields persisted in estimate.payload (ST BOQ/Estimate depth). Null when the estimate was created as a plain total. */
  baseAmount: number | null;
  markupPct: number;
  overheadPct: number;
  contingencyPct: number;
  gstPct: number;
}
const asEst = oneOf<EstimateStatus>(["draft", "submitted", "approved", "superseded", "rejected"], "draft");

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface EstimateBuildUpInput { baseAmount: number; markupPct?: number; overheadPct?: number; contingencyPct?: number; gstPct?: number; }
export interface EstimateBuildUp {
  baseAmount: number;
  markupPct: number; overheadPct: number; contingencyPct: number; gstPct: number;
  markup: number; overhead: number; contingency: number;
  subtotal: number; gst: number; total: number;
}
/**
 * Build-up a client-facing quote from a BOQ base total:
 *   base → + markup% + overhead% + contingency% = subtotal → + GST% = total.
 * Pure; all components rounded to 2dp (total stays fractional until the DB
 * bigint write, where the caller rounds). Zeroed percentages neutral.
 */
const numPct = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
export function estimateBuildUp(input: EstimateBuildUpInput): EstimateBuildUp {
  const markupPct = numPct(input.markupPct);
  const overheadPct = numPct(input.overheadPct);
  const contingencyPct = numPct(input.contingencyPct);
  const gstPct = numPct(input.gstPct);
  const baseAmount = Number(input.baseAmount ?? 0);
  const markup = round2((baseAmount * markupPct) / 100);
  const overhead = round2((baseAmount * overheadPct) / 100);
  const contingency = round2((baseAmount * contingencyPct) / 100);
  const subtotal = round2(baseAmount + markup + overhead + contingency);
  const gst = round2((subtotal * gstPct) / 100);
  return { baseAmount, markupPct, overheadPct, contingencyPct, gstPct, markup, overhead, contingency, subtotal, gst, total: round2(subtotal + gst) };
}

/** jsonb payload for estimate.payload — persists the build-up inputs for the row breakdown. */
export function estimatePayload(up: EstimateBuildUp): Record<string, unknown> {
  return {
    baseAmount: up.baseAmount,
    markupPct: up.markupPct,
    overheadPct: up.overheadPct,
    contingencyPct: up.contingencyPct,
    gstPct: up.gstPct,
  };
}

/** Next version for a named estimate (estimate has unique (project_id, name, version)). */
export function nextEstimateVersion(rows: Estimate[], name: string): number {
  const max = rows.reduce((m, r) => (r.name === name && r.version > m ? r.version : m), 0);
  return max + 1;
}

const readPayload = (p: unknown): Pick<Estimate, "baseAmount" | "markupPct" | "overheadPct" | "contingencyPct" | "gstPct"> => {
  if (p == null || typeof p !== "object") return { baseAmount: null, markupPct: 0, overheadPct: 0, contingencyPct: 0, gstPct: 0 };
  const o = p as Record<string, unknown>;
  return {
    baseAmount: o.baseAmount == null ? null : Number(o.baseAmount),
    markupPct: Number(o.markupPct ?? 0),
    overheadPct: Number(o.overheadPct ?? 0),
    contingencyPct: Number(o.contingencyPct ?? 0),
    gstPct: Number(o.gstPct ?? 0),
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listEstimates(client: any, projectId: string): Promise<Result<Estimate[]>> {
  try {
    const { data, error } = await client.from("estimate").select("id, name, version, total_amount, status, payload").eq("project_id", projectId).order("version", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => {
      const payload = readPayload(r.payload);
      return { id: String(r.id), name: String(r.name ?? ""), version: Number(r.version ?? 1), totalAmount: Number(r.total_amount ?? 0), status: asEst(r.status), ...payload };
    }));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createEstimate(client: any, input: { projectId: string; name: string; totalAmount: number; version?: number; payload?: Record<string, unknown>; createdBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("estimate").insert({ project_id: input.projectId, name: input.name, total_amount: input.totalAmount, version: input.version ?? 1, payload: input.payload ?? {}, created_by: input.createdBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setEstimateStatus = (client: any, id: string, status: EstimateStatus) => upd(client, "estimate", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteEstimate = (client: any, id: string) => del(client, "estimate", id);
