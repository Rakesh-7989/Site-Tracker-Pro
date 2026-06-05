// SiteTrack Pro — design/contract queries (v3 port, Batch 4). DB-wired to
// drawings / rfi via the migration 72/75 bridge.

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
export interface Drawing { id: string; title: string; type: string; revision: string; status: DrawingStatus; releaseDate: string | null; }
const asDw = oneOf<DrawingStatus>(["current", "superseded"], "current");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listDrawings(client: any, projectId: string): Promise<Result<Drawing[]>> {
  try {
    const { data, error } = await client.from("drawings").select("id, title, type, revision, status, release_date").eq("project_id", projectId).order("release_date", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), title: String(r.title ?? ""), type: String(r.type ?? ""), revision: String(r.revision ?? "Rev A"), status: asDw(r.status), releaseDate: r.release_date == null ? null : String(r.release_date) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createDrawing(client: any, input: { projectId: string; title: string; type: string; revision?: string; releasedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("drawings").insert({ project_id: input.projectId, title: input.title, type: input.type, revision: input.revision || "Rev A", released_by: input.releasedBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setDrawingStatus = (client: any, id: string, status: DrawingStatus) => upd(client, "drawings", id, { status });
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
