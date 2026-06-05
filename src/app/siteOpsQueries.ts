// SiteTrack Pro — site-ops queries (v3 port, Batch 2). DB-wired to materials /
// safety / inspections / punch via the migration 72+73 bridge.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const err = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbErr = (error: { message?: string }): Result<never> => ({ ok: false, error: String(error.message ?? error) });
const oneOf = <T extends string>(vals: readonly T[], fallback: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fallback);

// ── Materials ───────────────────────────────────────────────────────────────
export type MaterialStatus = "expected" | "received" | "rejected";
export interface Material { id: string; material: string; quantity: string | null; supplier: string | null; deliveryDate: string | null; status: MaterialStatus; }
const asMatStatus = oneOf<MaterialStatus>(["expected", "received", "rejected"], "expected");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMaterials(client: any, projectId: string): Promise<Result<Material[]>> {
  try {
    const { data, error } = await client.from("materials").select("id, material, quantity, supplier, delivery_date, status").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), material: String(r.material ?? ""), quantity: r.quantity == null ? null : String(r.quantity),
      supplier: r.supplier == null ? null : String(r.supplier), deliveryDate: r.delivery_date == null ? null : String(r.delivery_date), status: asMatStatus(r.status),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createMaterial(client: any, input: { projectId: string; material: string; quantity?: string; supplier?: string; deliveryDate?: string | null; loggedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("materials").insert({ project_id: input.projectId, material: input.material, quantity: input.quantity || null, supplier: input.supplier || null, delivery_date: input.deliveryDate || null, logged_by: input.loggedBy }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setMaterialStatus = (client: any, id: string, status: MaterialStatus) => simpleUpdate(client, "materials", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteMaterial = (client: any, id: string) => simpleDelete(client, "materials", id);

// ── Safety ────────────────────────────────────────────────────────────────
export type SafetySeverity = "near_miss" | "first_aid" | "minor" | "major" | "fatal";
export type SafetyStatus = "open" | "resolved" | "escalated";
export interface SafetyIncident { id: string; description: string; severity: SafetySeverity; category: string | null; location: string | null; actionTaken: string | null; status: SafetyStatus; incidentDate: string; }
const asSev = oneOf<SafetySeverity>(["near_miss", "first_aid", "minor", "major", "fatal"], "near_miss");
const asSafetyStatus = oneOf<SafetyStatus>(["open", "resolved", "escalated"], "open");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listSafety(client: any, projectId: string): Promise<Result<SafetyIncident[]>> {
  try {
    const { data, error } = await client.from("safety").select("id, description, severity, category, location, action_taken, status, incident_date").eq("project_id", projectId).order("incident_date", { ascending: false });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), description: String(r.description ?? ""), severity: asSev(r.severity), category: r.category == null ? null : String(r.category),
      location: r.location == null ? null : String(r.location), actionTaken: r.action_taken == null ? null : String(r.action_taken), status: asSafetyStatus(r.status), incidentDate: String(r.incident_date ?? ""),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createSafety(client: any, input: { projectId: string; description: string; severity: SafetySeverity; category?: string; location?: string; actionTaken?: string; reportedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("safety").insert({ project_id: input.projectId, description: input.description, severity: input.severity, category: input.category || null, location: input.location || null, action_taken: input.actionTaken || null, reported_by: input.reportedBy }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setSafetyStatus = (client: any, id: string, status: SafetyStatus) => simpleUpdate(client, "safety", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteSafety = (client: any, id: string) => simpleDelete(client, "safety", id);

// ── Inspections ─────────────────────────────────────────────────────────────
export type InspectionResult = "pending" | "pass" | "fail" | "conditional";
export interface Inspection { id: string; type: string; scope: string | null; inspectorName: string | null; scheduledDate: string | null; result: InspectionResult; }
const asResult = oneOf<InspectionResult>(["pending", "pass", "fail", "conditional"], "pending");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listInspections(client: any, projectId: string): Promise<Result<Inspection[]>> {
  try {
    const { data, error } = await client.from("inspections").select("id, type, scope, inspector_name, scheduled_date, result").eq("project_id", projectId).order("scheduled_date", { ascending: false });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), type: String(r.type ?? ""), scope: r.scope == null ? null : String(r.scope),
      inspectorName: r.inspector_name == null ? null : String(r.inspector_name), scheduledDate: r.scheduled_date == null ? null : String(r.scheduled_date), result: asResult(r.result),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createInspection(client: any, input: { projectId: string; type: string; scope?: string; scheduledDate?: string | null; inspectorId: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("inspections").insert({ project_id: input.projectId, type: input.type, scope: input.scope || null, scheduled_date: input.scheduledDate || null, inspector_id: input.inspectorId, result: "pending" }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setInspectionResult(client: any, id: string, result: InspectionResult) {
  return simpleUpdate(client, "inspections", id, { result, conducted_date: result === "pending" ? null : new Date().toISOString().slice(0, 10), status: result === "pending" ? "scheduled" : "completed" });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteInspection = (client: any, id: string) => simpleDelete(client, "inspections", id);

// ── Punch list ──────────────────────────────────────────────────────────────
export type PunchSeverity = "low" | "medium" | "high" | "critical";
export type PunchStatus = "open" | "in_progress" | "resolved" | "verified" | "wont_fix";
export interface PunchItem { id: string; location: string; defect: string; trade: string | null; severity: PunchSeverity; assignedTo: string | null; status: PunchStatus; }
const asPunchSev = oneOf<PunchSeverity>(["low", "medium", "high", "critical"], "medium");
const asPunchStatus = oneOf<PunchStatus>(["open", "in_progress", "resolved", "verified", "wont_fix"], "open");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPunch(client: any, projectId: string): Promise<Result<PunchItem[]>> {
  try {
    const { data, error } = await client.from("punch").select("id, location, defect, trade, severity, assigned_to, status").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), location: String(r.location ?? ""), defect: String(r.defect ?? ""), trade: r.trade == null ? null : String(r.trade),
      severity: asPunchSev(r.severity), assignedTo: r.assigned_to == null ? null : String(r.assigned_to), status: asPunchStatus(r.status),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPunch(client: any, input: { projectId: string; location: string; defect: string; trade?: string; severity: PunchSeverity; reportedBy: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("punch").insert({ project_id: input.projectId, location: input.location, defect: input.defect, trade: input.trade || null, severity: input.severity, reported_by: input.reportedBy }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setPunchStatus = (client: any, id: string, status: PunchStatus) => simpleUpdate(client, "punch", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deletePunch = (client: any, id: string) => simpleDelete(client, "punch", id);

// ── shared helpers ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function simpleUpdate(client: any, table: string, id: string, patch: Record<string, unknown>): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).update(patch).eq("id", id); if (error) return dbErr(error); return ok({ ok: true }); } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function simpleDelete(client: any, table: string, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).delete().eq("id", id); if (error) return dbErr(error); return ok({ ok: true }); } catch (e) { return err(e); }
}
