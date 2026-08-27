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

// ── Submittals ─────────────────────────────────────────────────────
export type SubmittalType = "shop_drawing" | "material_sample" | "method_statement";
export type SubmittalStatus = "pending" | "approved" | "approved_w_comments" | "rejected" | "resubmit";
export interface Submittal { id: string; no: string; type: SubmittalType; title: string; description: string | null; status: SubmittalStatus; submittedBy: string | null; submittedAt: string | null; reviewerRole: string | null; reviewedBy: string | null; reviewedAt: string | null; comments: string | null; }
const asSubType = oneOf<SubmittalType>(["shop_drawing", "material_sample", "method_statement"], "shop_drawing");
const asSubStatus = oneOf<SubmittalStatus>(["pending", "approved", "approved_w_comments", "rejected", "resubmit"], "pending");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listSubmittals(client: any, projectId: string): Promise<Result<Submittal[]>> {
  try {
    const { data, error } = await client.from("submittals").select("id, no, type, title, description, status, submitted_by, submitted_at, reviewer_role, reviewed_by, reviewed_at, comments").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), no: String(r.no ?? ""), type: asSubType(r.type), title: String(r.title ?? ""), description: r.description == null ? null : String(r.description), status: asSubStatus(r.status), submittedBy: r.submitted_by == null ? null : String(r.submitted_by), submittedAt: r.submitted_at == null ? null : String(r.submitted_at), reviewerRole: r.reviewer_role == null ? null : String(r.reviewer_role), reviewedBy: r.reviewed_by == null ? null : String(r.reviewed_by), reviewedAt: r.reviewed_at == null ? null : String(r.reviewed_at), comments: r.comments == null ? null : String(r.comments),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createSubmittal(client: any, input: { projectId: string; no: string; type: SubmittalType; title: string; description?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("submittals").insert({ project_id: input.projectId, no: input.no, type: input.type, title: input.title, description: input.description || null }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setSubmittalStatus = (client: any, id: string, status: SubmittalStatus) => simpleUpdate(client, "submittals", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteSubmittal = (client: any, id: string) => simpleDelete(client, "submittals", id);

// ── Permits ───────────────────────────────────────────────────────
export type PermitKind = "environment" | "commencement" | "occupancy" | "fire" | "electrical";
export type PermitStatus = "applied" | "issued" | "rejected" | "expired" | "renewal_due";
export interface Permit { id: string; kind: PermitKind; issuingAuthority: string | null; refNo: string | null; appliedAt: string | null; issuedAt: string | null; validUntil: string | null; status: PermitStatus; cost: number | null; notes: string | null; appliedBy: string | null; }
const asPermitKind = oneOf<PermitKind>(["environment", "commencement", "occupancy", "fire", "electrical"], "environment");
const asPermitStatus = oneOf<PermitStatus>(["applied", "issued", "rejected", "expired", "renewal_due"], "applied");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPermits(client: any, projectId: string): Promise<Result<Permit[]>> {
  try {
    const { data, error } = await client.from("permits").select("id, kind, issuing_authority, ref_no, applied_at, issued_at, valid_until, status, cost, notes, applied_by").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), kind: asPermitKind(r.kind), issuingAuthority: r.issuing_authority == null ? null : String(r.issuing_authority), refNo: r.ref_no == null ? null : String(r.ref_no), appliedAt: r.applied_at == null ? null : String(r.applied_at), issuedAt: r.issued_at == null ? null : String(r.issued_at), validUntil: r.valid_until == null ? null : String(r.valid_until), status: asPermitStatus(r.status), cost: r.cost == null ? null : Number(r.cost), notes: r.notes == null ? null : String(r.notes), appliedBy: r.applied_by == null ? null : String(r.applied_by),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPermit(client: any, input: { projectId: string; kind: PermitKind; issuingAuthority?: string; refNo?: string; appliedAt?: string; cost?: number }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("permits").insert({ project_id: input.projectId, kind: input.kind, issuing_authority: input.issuingAuthority || null, ref_no: input.refNo || null, applied_at: input.appliedAt || null, cost: input.cost ?? null }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setPermitStatus = (client: any, id: string, status: PermitStatus) => simpleUpdate(client, "permits", id, { status });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deletePermit = (client: any, id: string) => simpleDelete(client, "permits", id);

// ── Handover packet (Sprint 4) ───────────────────────────────────
export interface HandoverSummary { projectId: string; projectName: string; orgName: string; address: string; startedAt: string | null; completedAt: string | null; drawingsCount: number; photosCount: number; paymentsTotalInr: number; raBillsTotalInr: number; punchOpen: number; punchResolved: number; submittalsPending: number; submittalsApproved: number; permitsActive: number; permitsIssued: number; merkleRoot: string | null; generatedAt: string | null; }

// ── Worklogs ─────────────────────────────────────────────────────
export interface Worklog { id: string; date: string; activity: string; hours: number; notes: string | null; profileId: string; taskId: string | null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listWorklogs(client: any, projectId: string): Promise<Result<Worklog[]>> {
  try {
    const { data, error } = await client.from("worklogs").select("id, date, activity, hours, notes, profile_id, task_id").eq("project_id", projectId).order("date", { ascending: false }).limit(50);
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), date: String(r.date ?? ""), activity: String(r.activity ?? ""), hours: Number(r.hours ?? 0), notes: r.notes == null ? null : String(r.notes), profileId: String(r.profile_id ?? ""), taskId: r.task_id == null ? null : String(r.task_id),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createWorklog(client: any, input: { projectId: string; profileId: string; date: string; activity: string; hours: number; notes?: string; taskId?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("worklogs").insert({ project_id: input.projectId, profile_id: input.profileId, date: input.date, activity: input.activity, hours: input.hours, notes: input.notes || null, task_id: input.taskId || null }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteWorklog = (client: any, id: string) => simpleDelete(client, "worklogs", id);

// ── Equipment ────────────────────────────────────────────────────
export type EquipmentOwnership = "owned" | "rental" | "hire";
export type EquipmentStatus = "on_site" | "demobilised" | "under_maintenance" | "idle";
export interface Equipment { id: string; name: string; assetNo: string | null; type: string | null; ownership: EquipmentOwnership; ratePerDay: number | null; onSiteFrom: string | null; onSiteTo: string | null; status: EquipmentStatus; lastMaintenance: string | null; nextMaintenance: string | null; operatorName: string | null; notes: string | null; }
const asEqOwn = oneOf<EquipmentOwnership>(["owned", "rental", "hire"], "rental");
const asEqStatus = oneOf<EquipmentStatus>(["on_site", "demobilised", "under_maintenance", "idle"], "on_site");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listEquipment(client: any, projectId: string): Promise<Result<Equipment[]>> {
  try {
    const { data, error } = await client.from("equipment").select("id, name, asset_no, type, ownership, rate_per_day, on_site_from, on_site_to, status, last_maintenance, next_maintenance, operator_name, notes").eq("project_id", projectId).order("name", { ascending: true });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), assetNo: r.asset_no == null ? null : String(r.asset_no), type: r.type == null ? null : String(r.type), ownership: asEqOwn(r.ownership), ratePerDay: r.rate_per_day == null ? null : Number(r.rate_per_day), onSiteFrom: r.on_site_from == null ? null : String(r.on_site_from), onSiteTo: r.on_site_to == null ? null : String(r.on_site_to), status: asEqStatus(r.status), lastMaintenance: r.last_maintenance == null ? null : String(r.last_maintenance), nextMaintenance: r.next_maintenance == null ? null : String(r.next_maintenance), operatorName: r.operator_name == null ? null : String(r.operator_name), notes: r.notes == null ? null : String(r.notes),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createEquipment(client: any, input: { projectId: string; name: string; assetNo?: string; type?: string; ownership?: EquipmentOwnership; ratePerDay?: number; operatorName?: string; notes?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("equipment").insert({ project_id: input.projectId, name: input.name, asset_no: input.assetNo || null, type: input.type || null, ownership: input.ownership || "rental", rate_per_day: input.ratePerDay ?? null, operator_name: input.operatorName || null, notes: input.notes || null }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteEquipment = (client: any, id: string) => simpleDelete(client, "equipment", id);

// ── Measurement Book ─────────────────────────────────────────────
export type MbStatus = "recorded" | "verified" | "billed" | "disputed" | "cancelled";
export interface MbEntry { id: string; mbNo: string; pageNo: number | null; description: string; location: string | null; unit: string | null; length: number | null; breadth: number | null; depth: number | null; qty: number; rate: number | null; amount: number | null; status: MbStatus; measuredAt: string; verifiedAt: string | null; notes: string | null; }
const asMbStatus = oneOf<MbStatus>(["recorded", "verified", "billed", "disputed", "cancelled"], "recorded");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMeasurementBook(client: any, projectId: string): Promise<Result<MbEntry[]>> {
  try {
    const { data, error } = await client.from("measurement_book").select("id, mb_no, page_no, description, location, unit, length, breadth, depth, qty, rate, amount, status, measured_at, verified_at, notes").eq("project_id", projectId).order("measured_at", { ascending: false }).limit(100);
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), mbNo: String(r.mb_no ?? ""), pageNo: r.page_no == null ? null : Number(r.page_no), description: String(r.description ?? ""), location: r.location == null ? null : String(r.location), unit: r.unit == null ? null : String(r.unit), length: r.length == null ? null : Number(r.length), breadth: r.breadth == null ? null : Number(r.breadth), depth: r.depth == null ? null : Number(r.depth), qty: Number(r.qty ?? 0), rate: r.rate == null ? null : Number(r.rate), amount: r.amount == null ? null : Number(r.amount), status: asMbStatus(r.status), measuredAt: String(r.measured_at ?? ""), verifiedAt: r.verified_at == null ? null : String(r.verified_at), notes: r.notes == null ? null : String(r.notes),
    })));
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createMbEntry(client: any, input: { projectId: string; mbNo: string; pageNo?: number; description: string; location?: string; unit?: string; length?: number; breadth?: number; depth?: number; qty: number; rate?: number; notes?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("measurement_book").insert({
      project_id: input.projectId, mb_no: input.mbNo, page_no: input.pageNo ?? null, description: input.description, location: input.location || null, unit: input.unit || null,
      length: input.length ?? null, breadth: input.breadth ?? null, depth: input.depth ?? null, qty: input.qty, rate: input.rate ?? null, notes: input.notes || null,
    }).select("id").single();
    if (error) return dbErr(error); return ok({ id: String(data.id) });
  } catch (e) { return err(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setMbStatus = (client: any, id: string, status: MbStatus) => simpleUpdate(client, "measurement_book", id, { status });
