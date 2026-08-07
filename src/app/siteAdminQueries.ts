// SiteTrack Pro — BOQ / Labour / Compliance / Field-Ops (worklog) queries
// (v3 port, final batch). DB-wired via the migration 76 bridge (boq_items,
// labour_register, compliance) + the 73 bridge (worklogs).

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upd(client: any, table: string, id: string, patch: Record<string, unknown>): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).update(patch).eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function del(client: any, table: string, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).delete().eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}

// ── BOQ ───────────────────────────────────────────────────────────────────
export type BoqCategory = "Civil" | "MEP" | "Finishing" | "External" | "Other";
export interface BoqItem { id: string; code: string | null; description: string; unit: string | null; qty: number | null; rate: number | null; amount: number | null; category: BoqCategory; }
const asCat = oneOf<BoqCategory>(["Civil", "MEP", "Finishing", "External", "Other"], "Other");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listBoq(client: any, projectId: string): Promise<Result<BoqItem[]>> {
  try {
    const { data, error } = await client.from("boq_items").select("id, code, description, unit, qty, rate, amount, category, sort_order").eq("project_id", projectId).order("sort_order", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), code: r.code == null ? null : String(r.code), description: String(r.description ?? ""), unit: r.unit == null ? null : String(r.unit), qty: num(r.qty), rate: num(r.rate), amount: num(r.amount), category: asCat(r.category) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createBoq(client: any, input: { projectId: string; description: string; code?: string; unit?: string; qty: number; rate: number; category?: BoqCategory; sortOrder?: number }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("boq_items").insert({ project_id: input.projectId, description: input.description, code: input.code || null, unit: input.unit || null, qty: input.qty, rate: input.rate, category: input.category ?? "Other", sort_order: input.sortOrder ?? 0 }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteBoq = (client: any, id: string) => del(client, "boq_items", id);

// ── Labour register ─────────────────────────────────────────────────────────
export interface LabourEntry { id: string; name: string; trade: string | null; wage: number | null; joined: string | null; aadhaarMasked: string | null; epf: string | null; esi: string | null; }
const maskAadhaar = (v: unknown): string | null => { const s = v == null ? "" : String(v).replace(/\s/g, ""); return s ? `•••• •••• ${s.slice(-4)}` : null; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listLabour(client: any, projectId: string): Promise<Result<LabourEntry[]>> {
  try {
    const { data, error } = await client.from("labour_register").select("id, name, trade, wage, joined, aadhaar, epf, esi").eq("project_id", projectId).order("joined", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), name: String(r.name ?? ""), trade: r.trade == null ? null : String(r.trade), wage: num(r.wage), joined: r.joined == null ? null : String(r.joined), aadhaarMasked: maskAadhaar(r.aadhaar), epf: r.epf == null ? null : String(r.epf), esi: r.esi == null ? null : String(r.esi) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createLabour(client: any, input: { projectId: string; name: string; trade?: string; wage?: number; aadhaar?: string; epf?: string; esi?: string; joined?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("labour_register").insert({ project_id: input.projectId, name: input.name, trade: input.trade || null, wage: input.wage ?? null, aadhaar: input.aadhaar || null, epf: input.epf || null, esi: input.esi || null, joined: input.joined || null }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteLabour = (client: any, id: string) => del(client, "labour_register", id);

// ── Compliance (project-level rows) ─────────────────────────────────────────
export type ComplianceKind = "rera" | "gst" | "epfo" | "pan" | "other";
export type ComplianceStatus = "pending" | "filed" | "accepted" | "rejected" | "expired" | "renewal_due";
export interface ComplianceItem { id: string; kind: ComplianceKind; refNo: string | null; stage: string | null; status: ComplianceStatus; expiresAt: string | null; notes: string | null; }
const asKind = oneOf<ComplianceKind>(["rera", "gst", "epfo", "pan", "other"], "other");
const asCompStatus = oneOf<ComplianceStatus>(["pending", "filed", "accepted", "rejected", "expired", "renewal_due"], "pending");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listCompliance(client: any, projectId: string): Promise<Result<ComplianceItem[]>> {
  try {
    const { data, error } = await client.from("compliance").select("id, kind, ref_no, stage, status, expires_at, notes").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), kind: asKind(r.kind), refNo: r.ref_no == null ? null : String(r.ref_no), stage: r.stage == null ? null : String(r.stage), status: asCompStatus(r.status), expiresAt: r.expires_at == null ? null : String(r.expires_at), notes: r.notes == null ? null : String(r.notes) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createCompliance(client: any, input: { orgId: string; projectId: string; kind: ComplianceKind; refNo?: string; stage?: string; filedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("compliance").insert({ org_id: input.orgId, project_id: input.projectId, kind: input.kind, ref_no: input.refNo || null, stage: input.stage || null, filed_by: input.filedBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setComplianceStatus = (client: any, id: string, status: ComplianceStatus) => upd(client, "compliance", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteCompliance = (client: any, id: string) => del(client, "compliance", id);

// ── Field Ops — worklogs (site diary) ───────────────────────────────────────
export interface WorkLog { id: string; date: string; activity: string; hours: number | null; notes: string | null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listWorklogs(client: any, projectId: string): Promise<Result<WorkLog[]>> {
  try {
    const { data, error } = await client.from("worklogs").select("id, date, activity, hours, notes").eq("project_id", projectId).order("date", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), date: String(r.date ?? ""), activity: String(r.activity ?? ""), hours: num(r.hours), notes: r.notes == null ? null : String(r.notes) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createWorklog(client: any, input: { projectId: string; profileId: string; activity: string; hours: number; notes?: string; date?: string }): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = { project_id: input.projectId, profile_id: input.profileId, activity: input.activity, hours: input.hours, notes: input.notes || null };
    if (input.date) row.date = input.date;
    const { data, error } = await client.from("worklogs").insert(row).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteWorklog = (client: any, id: string) => del(client, "worklogs", id);
