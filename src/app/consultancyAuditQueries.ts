// SiteTrack Pro — Consultancy inspection/audit module (v4 Phase C).
// DB: inspection_checklists / inspection_results / consultancy_reports
// (migration 163). RLS: read = project member; insert/update/delete = managers
// + org admin (mirrors 152_statutory_approvals). UI gating via the
// audit:manage capability + PlanFeature "audit_reports" at the tab level.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

// ── Inspection checklists ────────────────────────────────────────────────────
export type ChecklistKind = "site_visit" | "design_review" | "quality_audit" | "other";
export const CHECKLIST_KINDS: readonly ChecklistKind[] = ["site_visit", "design_review", "quality_audit", "other"];
export type ChecklistStatus = "draft" | "in_progress" | "passed" | "failed" | "cancelled";
export const CHECKLIST_STATUSES: readonly ChecklistStatus[] = ["draft", "in_progress", "passed", "failed", "cancelled"];
const asKind = oneOf<ChecklistKind>(CHECKLIST_KINDS, "other");
const asStatus = oneOf<ChecklistStatus>(CHECKLIST_STATUSES, "draft");

export interface InspectionChecklist {
  id: string;
  projectId: string;
  kind: ChecklistKind;
  title: string;
  status: ChecklistStatus;
  createdByName: string | null;
  createdAt: string;
}

const CL_SELECT = "id, project_id, kind, title, status, created_by, created_at";

function mapChecklist(r: Record<string, unknown>): InspectionChecklist {
  return {
    id: String(r.id),
    projectId: String(r.project_id ?? ""),
    kind: asKind(r.kind),
    title: String(r.title ?? ""),
    status: asStatus(r.status),
    createdByName: r.created_by == null ? null : String(r.created_by),
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listChecklists(client: any, projectId: string): Promise<Result<InspectionChecklist[]>> {
  try {
    const { data, error } = await client
      .from("inspection_checklists")
      .select(CL_SELECT)
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
    const row: Record<string, unknown> = { project_id: input.projectId, kind: input.kind, title: input.title };
    if (input.status) row.status = input.status;
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

// ── Inspection results ────────────────────────────────────────────────────────
export type ResultMark = "pass" | "fail" | "na";
export const RESULT_MARKS: readonly ResultMark[] = ["pass", "fail", "na"];
const asMark = oneOf<ResultMark>(RESULT_MARKS, "na");

export interface InspectionResult {
  id: string;
  checklistId: string;
  item: string;
  result: ResultMark;
  note: string | null;
  sortOrder: number;
}

const RES_SELECT = "id, checklist_id, item, result, note, sort_order";

function mapResult(r: Record<string, unknown>): InspectionResult {
  return {
    id: String(r.id),
    checklistId: String(r.checklist_id ?? ""),
    item: String(r.item ?? ""),
    result: asMark(r.result),
    note: r.note == null ? null : String(r.note),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listResults(client: any, checklistId: string): Promise<Result<InspectionResult[]>> {
  try {
    const { data, error } = await client
      .from("inspection_results")
      .select(RES_SELECT)
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
  result?: ResultMark;
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
export async function deleteResult(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("inspection_results").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Consultancy reports ───────────────────────────────────────────────────────
export type ReportKind = "site_visit" | "recommendation" | "milestone_review";
export const REPORT_KINDS: readonly ReportKind[] = ["site_visit", "recommendation", "milestone_review"];
export type ReportStatus = "draft" | "published" | "archived";
export const REPORT_STATUSES: readonly ReportStatus[] = ["draft", "published", "archived"];
const asReportKind = oneOf<ReportKind>(REPORT_KINDS, "site_visit");
const asReportStatus = oneOf<ReportStatus>(REPORT_STATUSES, "draft");

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
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const REP_SELECT = "id, project_id, kind, title, summary, content, status, period_from, period_to, created_by, created_at, updated_at";

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
    createdByName: r.created_by == null ? null : String(r.created_by),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listReports(client: any, projectId: string): Promise<Result<ConsultancyReport[]>> {
  try {
    const { data, error } = await client
      .from("consultancy_reports")
      .select(REP_SELECT)
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
      period_from: input.periodFrom ?? null,
      period_to: input.periodTo ?? null,
    };
    if (input.status) row.status = input.status;
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

// ── Pure helpers ─────────────────────────────────────────────────────────────

export interface ChecklistVerdict {
  total: number;
  passed: number;
  failed: number;
  na: number;
  /** pct of decisive (pass+fail) items that passed; 0 when none decisive. */
  passPct: number;
  /** "passed" | "failed" | "pending" — checklist level verdict. */
  verdict: "passed" | "failed" | "pending";
}

/** Roll up a checklist's results into a verdict. */
export function checklistVerdict(results: Pick<InspectionResult, "result">[]): ChecklistVerdict {
  let passed = 0;
  let failed = 0;
  let na = 0;
  for (const r of results) {
    if (r.result === "pass") passed += 1;
    else if (r.result === "fail") failed += 1;
    else na += 1;
  }
  const decisive = passed + failed;
  const passPct = decisive === 0 ? 0 : Math.round((passed / decisive) * 100);
  const verdict: ChecklistVerdict["verdict"] = decisive === 0 ? "pending" : failed > 0 ? "failed" : "passed";
  return { total: results.length, passed, failed, na, passPct, verdict };
}

/** Suggested next checklist status from a verdict (terminal statuses stay put). */
export const CL_STATUS_NEXT: Record<ChecklistStatus, ChecklistStatus> = {
  draft: "in_progress", in_progress: "passed", passed: "passed", failed: "failed", cancelled: "draft",
};

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
