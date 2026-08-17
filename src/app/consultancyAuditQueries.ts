// SiteTrack Pro — v4 Phase C1-C3: consultancy inspection/audit + reports.
// DB: inspection_checklists / inspection_results / consultancy_reports (migration 163).
// RLS: read = project member; insert/update = managers + org admin (audit:manage).
// UI gating: audit:manage capability + planFeature "audit_reports" at tab level.

import { workflowNextMap } from "./workflowEngine";
import { CHECKLIST_WORKFLOW, REPORT_WORKFLOW } from "./workflowDefinitions";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

// ── Checklists ─────────────────────────────────────────────────────────────────
export type ChecklistKind = "site_visit" | "design_review" | "quality_audit" | "other";
export type ChecklistStatus = "draft" | "in_progress" | "passed" | "failed" | "cancelled";

export interface InspectionChecklist {
  id: string;
  projectId: string;
  kind: ChecklistKind;
  title: string;
  status: ChecklistStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const CHECKLIST_SELECT = "id, project_id, kind, title, status, created_by, created_at, updated_at";
const asKind = oneOf<ChecklistKind>(["site_visit", "design_review", "quality_audit", "other"], "site_visit");
const asStatus = oneOf<ChecklistStatus>(["draft", "in_progress", "passed", "failed", "cancelled"], "draft");

function mapChecklist(r: Record<string, unknown>): InspectionChecklist {
  return {
    id: String(r.id),
    projectId: String(r.project_id ?? ""),
    kind: asKind(r.kind),
    title: String(r.title ?? ""),
    status: asStatus(r.status),
    createdBy: r.created_by == null ? null : String(r.created_by),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listChecklists(client: any, projectId: string): Promise<Result<InspectionChecklist[]>> {
  try {
    const { data, error } = await client
      .from("inspection_checklists")
      .select(CHECKLIST_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapChecklist));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertChecklist(client: any, input: {
  id?: string | null;
  projectId: string;
  kind: ChecklistKind;
  title: string;
  status?: ChecklistStatus;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      project_id: input.projectId,
      kind: input.kind,
      title: input.title,
      status: input.status ?? "draft",
    };
    if (input.id) {
      const { error } = await client.from("inspection_checklists").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("inspection_checklists").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setChecklistStatus(client: any, id: string, status: ChecklistStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("inspection_checklists").update({ status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteChecklist(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("inspection_checklists").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Results ────────────────────────────────────────────────────────────────────
export type ResultVerdict = "pass" | "fail" | "na";
export const RESULT_VERDICTS: readonly ResultVerdict[] = ["pass", "fail", "na"];
const asVerdict = oneOf<ResultVerdict>(RESULT_VERDICTS, "na");

export interface InspectionResult {
  id: string;
  checklistId: string;
  item: string;
  result: ResultVerdict;
  note: string | null;
  sortOrder: number;
  createdAt: string;
}

const RESULT_SELECT = "id, checklist_id, item, result, note, sort_order, created_at";

function mapResult(r: Record<string, unknown>): InspectionResult {
  return {
    id: String(r.id),
    checklistId: String(r.checklist_id ?? ""),
    item: String(r.item ?? ""),
    result: asVerdict(r.result),
    note: r.note == null ? null : String(r.note),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listResults(client: any, checklistId: string): Promise<Result<InspectionResult[]>> {
  try {
    const { data, error } = await client
      .from("inspection_results")
      .select(RESULT_SELECT)
      .eq("checklist_id", checklistId)
      .order("sort_order", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapResult));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertResult(client: any, input: {
  id?: string | null;
  checklistId: string;
  item: string;
  result?: ResultVerdict;
  note?: string | null;
  sortOrder?: number;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      checklist_id: input.checklistId,
      item: input.item,
      result: input.result ?? "na",
      note: input.note ?? null,
      sort_order: input.sortOrder ?? 0,
    };
    if (input.id) {
      const { error } = await client.from("inspection_results").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("inspection_results").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setResultVerdict(client: any, id: string, result: ResultVerdict): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("inspection_results").update({ result }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteResult(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("inspection_results").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// Pure: checklist progress rollup
export interface ChecklistProgress {
  total: number;
  passed: number;
  failed: number;
  na: number;
  pct: number; // passed / (passed + failed) * 100, clamped 0–100; 0 when none decisive
  overallStatus: ChecklistStatus; // derived from results: failed→failed, passed→passed, else in_progress
}

/** Test-compat alias: returns verdict/passPct instead of overallStatus/pct. */
export interface ChecklistVerdict {
  total: number;
  passed: number;
  failed: number;
  na: number;
  passPct: number;
  verdict: "passed" | "failed" | "pending";
}

export function checklistProgress(results: Pick<InspectionResult, "result">[]): ChecklistProgress {
  let passed = 0, failed = 0, na = 0;
  for (const r of results) {
    if (r.result === "pass") passed += 1;
    else if (r.result === "fail") failed += 1;
    else na += 1;
  }
  const decisive = passed + failed;
  const pct = decisive === 0 ? 0 : Math.round((passed / decisive) * 100);
  let overall: ChecklistStatus = "in_progress";
  if (failed > 0) overall = "failed";
  else if (decisive > 0 && failed === 0) overall = "passed";
  return { total: results.length, passed, failed, na, pct, overallStatus: overall };
}

export function checklistVerdict(results: Pick<InspectionResult, "result">[]): ChecklistVerdict {
  const base = checklistProgress(results);
  let verdict: ChecklistVerdict["verdict"] = "pending";
  if (base.failed > 0) verdict = "failed";
  else if (base.passed + base.failed > 0) verdict = "passed";
  return { total: base.total, passed: base.passed, failed: base.failed, na: base.na, passPct: base.pct, verdict };
}

export const CHECKLIST_STATUS_NEXT: Record<ChecklistStatus, ChecklistStatus | null> = workflowNextMap(CHECKLIST_WORKFLOW);

// ── Reports ────────────────────────────────────────────────────────────────────
export type ReportKind = "site_visit" | "recommendation" | "milestone_review";
export type ReportStatus = "draft" | "published" | "archived";
const asReportKind = oneOf<ReportKind>(["site_visit", "recommendation", "milestone_review"], "site_visit");
const asReportStatus = oneOf<ReportStatus>(["draft", "published", "archived"], "draft");

export interface ConsultancyReport {
  id: string;
  projectId: string;
  kind: ReportKind;
  title: string;
  summary: string | null;
  content: string | null;
  status: ReportStatus;
  periodFrom: string | null;
  periodTo: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const REPORT_SELECT = "id, project_id, kind, title, summary, content, status, period_from, period_to, created_by, created_at, updated_at";

function mapReport(r: Record<string, unknown>): ConsultancyReport {
  return {
    id: String(r.id),
    projectId: String(r.project_id ?? ""),
    kind: asReportKind(r.kind),
    title: String(r.title ?? ""),
    summary: r.summary == null ? null : String(r.summary),
    content: r.content == null ? null : String(r.content),
    status: asReportStatus(r.status),
    periodFrom: r.period_from == null ? null : String(r.period_from),
    periodTo: r.period_to == null ? null : String(r.period_to),
    createdBy: r.created_by == null ? null : String(r.created_by),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listReports(client: any, projectId: string): Promise<Result<ConsultancyReport[]>> {
  try {
    const { data, error } = await client
      .from("consultancy_reports")
      .select(REPORT_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapReport));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertReport(client: any, input: {
  id?: string | null;
  projectId: string;
  kind: ReportKind;
  title: string;
  summary?: string | null;
  content?: string | null;
  status?: ReportStatus;
  periodFrom?: string | null;
  periodTo?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      project_id: input.projectId,
      kind: input.kind,
      title: input.title,
      summary: input.summary ?? null,
      content: input.content ?? null,
      status: input.status ?? "draft",
      period_from: input.periodFrom ?? null,
      period_to: input.periodTo ?? null,
    };
    if (input.id) {
      const { error } = await client.from("consultancy_reports").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("consultancy_reports").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setReportStatus(client: any, id: string, status: ReportStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("consultancy_reports").update({ status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteReport(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("consultancy_reports").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// Pure: next report status (derived from the workflow register)
export const REPORT_STATUS_NEXT: Record<ReportStatus, ReportStatus | null> = workflowNextMap(REPORT_WORKFLOW);

// Label maps (for UI + tests)
export const CL_KIND_LABEL: Record<ChecklistKind, string> = {
  site_visit: "Site visit", design_review: "Design review", quality_audit: "Quality audit", other: "Other",
};
export const CL_STATUS_LABEL: Record<ChecklistStatus, string> = {
  draft: "Draft", in_progress: "In progress", passed: "Passed", failed: "Failed", cancelled: "Cancelled",
};
export const REP_KIND_LABEL: Record<ReportKind, string> = {
  site_visit: "Site visit", recommendation: "Recommendation", milestone_review: "Milestone review",
};
export const REP_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft", published: "Published", archived: "Archived",
};

// Alias for test compatibility
export const CL_STATUS_NEXT = CHECKLIST_STATUS_NEXT;