// SiteTrack Pro — utilization reporting (v4 C1).
// Fee-vs-effort variance per project. On a fixed-fee
// engagement there is no hourly billing; `billedValue` is the effort the
// team logged at the rate snapshot in each time entry (0 when rate unset).
//
//   fee          = committed phase fees (approved + in_progress + completed)
//   loggedHours  = billable hours logged
//   billedValue  = Σ billable hours × rate
//   variance     = fee − billedValue
//   utilization% = billedValue / fee × 100 (0 when fee = 0)
//
// UI gating via utilization:view; plan gate via planFeature 'utilization'
// (Business+). RLS: time_entries / fee_phases read = project member, so this
// only returns projects the caller can already see.

import { committedFee, type FeePhase } from "./phaseQueries";
import { APPROVAL_STATUSES, type TimeEntry } from "./timeQueries";
import { PROJECT_TYPES } from "@/auth/roles";
import type { MemberProjectScope } from "./queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

export interface ProjectBrief { id: string; name: string; type: string | null; }

export interface UtilizationRow {
  projectId: string;
  name: string;
  type: string | null;
  fee: number;            // committed phase fees, whole ₹
  loggedHours: number;    // billable hours
  billedValue: number;    // Σ billable hours × rate, ₹
  variance: number;       // fee − billedValue
  utilizationPct: number; // billedValue / fee × 100
}

export interface UtilizationPhaseRow {
  projectId: string;
  projectName: string;
  phaseId: string;
  phaseTitle: string;
  feeAmount: number;
  loggedHours: number;
  billedValue: number;
  variance: number;
  utilizationPct: number;
}

const CONSULTANCY_TYPES = PROJECT_TYPES;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectsByType(client: any, orgId: string, types: readonly string[] = CONSULTANCY_TYPES, scope: MemberProjectScope = { mode: "all" }): Promise<Result<ProjectBrief[]>> {
  try {
    let q = client
      .from("projects")
      .select("id, name, type")
      .eq("org_id", orgId);
    if (scope.mode === "member") {
      // PostgREST ignores `IN ()` on an empty array — short-circuit instead.
      if (scope.projectIds.length === 0) return ok([]);
      q = q.in("id", scope.projectIds);
    }
    const { data, error } = await q.in("type", [...types]);
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), type: r.type == null ? null : String(r.type),
    })));
  } catch (e) { return er(e); }
}

/** Build a utilization row from raw phases + time entries for one project. */
export function computeUtilization(p: ProjectBrief, phases: FeePhase[], entries: TimeEntry[]): UtilizationRow {
  const fee = committedFee(phases);
  const loggedHours = entries.filter(e => e.billable).reduce((s, e) => s + (Number.isFinite(e.hours) ? e.hours : 0), 0);
  const billedValue = entries
    .filter(e => e.billable && e.rate != null)
    .reduce((s, e) => s + (Number.isFinite(e.hours) ? e.hours : 0) * (e.rate ?? 0), 0);
  const variance = fee - billedValue;
  const utilizationPct = fee > 0 ? Math.round((billedValue / fee) * 100) : 0;
  return { projectId: p.id, name: p.name, type: p.type, fee, loggedHours, billedValue, variance, utilizationPct };
}

/**
 * Org-wide utilization across consultancy/design projects. Fetches the
 * project list once, then phase + time rows for all of them in two calls
 * (filters by project id list), then computes rows locally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgUtilization(client: any, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<UtilizationRow[]>> {
  try {
    const projects = await listProjectsByType(client, orgId, CONSULTANCY_TYPES, scope);
    if (!projects.ok) return projects;
    if (projects.data.length === 0) return ok([]);
    const ids = projects.data.map(p => p.id);

    const [phasesRes, entriesRes] = await Promise.all([
      client.from("fee_phases").select("id, project_id, title, scope, fee_amount, status, due_date, completed_date, sort_order, created_at").in("project_id", ids),
      client.from("time_entries").select("id, project_id, profile_id, date, activity, hours, billable, rate, notes, approval_status, approved_by, approved_at, billed, billed_invoice_id, created_at, phase_id").in("project_id", ids),
    ]);
    if (phasesRes.error) return dbe(phasesRes.error);
    if (entriesRes.error) return dbe(entriesRes.error);

    const phasesByProject = new Map<string, FeePhase[]>();
    for (const r of (phasesRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      if (!phasesByProject.has(pid)) phasesByProject.set(pid, []);
      phasesByProject.get(pid)!.push({
        id: String(r.id), title: String(r.title ?? ""), scope: r.scope == null ? null : String(r.scope),
        feeAmount: Number(r.fee_amount ?? 0), status: (r.status as FeePhase["status"]) ?? "draft",
        dueDate: r.due_date == null ? null : String(r.due_date),
        completedDate: r.completed_date == null ? null : String(r.completed_date),
        sortOrder: Number(r.sort_order ?? 0), createdAt: String(r.created_at ?? ""),
      });
    }
    const entriesByProject = new Map<string, TimeEntry[]>();
    for (const r of (entriesRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      if (!entriesByProject.has(pid)) entriesByProject.set(pid, []);
      entriesByProject.get(pid)!.push({
        id: String(r.id), profileId: String(r.profile_id ?? ""), memberName: null,
        date: String(r.date ?? ""), activity: String(r.activity ?? ""), hours: Number(r.hours ?? 0),
        billable: Boolean(r.billable), rate: r.rate == null ? null : Number(r.rate),
        notes: r.notes == null ? null : String(r.notes),
        approvalStatus: (APPROVAL_STATUSES as readonly string[]).includes(String(r.approval_status ?? "pending"))
          ? String(r.approval_status) as TimeEntry["approvalStatus"] : "pending",
        approvedBy: r.approved_by == null ? null : String(r.approved_by),
        approvedAt: r.approved_at == null ? null : String(r.approved_at),
        billed: Boolean(r.billed),
        billedInvoiceId: r.billed_invoice_id == null ? null : String(r.billed_invoice_id),
        createdAt: String(r.created_at ?? ""),
        phaseId: r.phase_id == null ? null : String(r.phase_id),
      });
    }

    return ok(projects.data.map(p => computeUtilization(
      p,
      phasesByProject.get(p.id) ?? [],
      entriesByProject.get(p.id) ?? [],
    )));
  } catch (e) { return er(e); }
}

const UNASSIGNED_PHASE_ID = "__unassigned__";

/** Sort phases by fee descending so the heaviest commit lands first. */
function phaseSort(a: UtilizationPhaseRow, b: UtilizationPhaseRow): number {
  if (a.phaseId === UNASSIGNED_PHASE_ID) return 1;
  if (b.phaseId === UNASSIGNED_PHASE_ID) return -1;
  return b.feeAmount - a.feeAmount;
}

/**
 * Build per-phase utilization rows for one project from raw phase + entry
 * records. Billable entries without a phase_id roll into a single "Unassigned"
 * bucket so effort isn't silently dropped from the drill-down. Pure — no
 * client dependency, unit-testable.
 */
export function buildPhaseRows(
  projectId: string,
  projectName: string,
  phases: Array<Record<string, unknown>>,
  entries: Array<Record<string, unknown>>,
): UtilizationPhaseRow[] {
  const rows: UtilizationPhaseRow[] = [];

  let unassignedHours = 0;
  let unassignedValue = 0;

  for (const p of phases) {
    const phaseId = String(p.id);
    const phaseTitle = String(p.title ?? "");
    const feeAmount = Number(p.fee_amount ?? 0);
    const phaseEntries = entries.filter(e => String(e.phase_id ?? "") === phaseId);

    const loggedHours = phaseEntries
      .filter(e => Boolean(e.billable))
      .reduce((s, e) => s + Number(e.hours ?? 0), 0);

    const billedValue = phaseEntries
      .filter(e => Boolean(e.billable) && e.rate != null)
      .reduce((s, e) => s + (Number(e.hours ?? 0) * Number(e.rate ?? 0)), 0);

    const variance = feeAmount - billedValue;
    const utilizationPct = feeAmount > 0 ? Math.round((billedValue / feeAmount) * 100) : 0;

    rows.push({ projectId, projectName, phaseId, phaseTitle, feeAmount, loggedHours, billedValue, variance, utilizationPct });
  }

  const unassigned = entries.filter(e => Boolean(e.billable) && (e.phase_id == null || String(e.phase_id) === ""));
  if (unassigned.length > 0) {
    unassignedHours = unassigned.reduce((s, e) => s + Number(e.hours ?? 0), 0);
    unassignedValue = unassigned
      .filter(e => e.rate != null)
      .reduce((s, e) => s + (Number(e.hours ?? 0) * Number(e.rate ?? 0)), 0);
    rows.push({
      projectId, projectName, phaseId: UNASSIGNED_PHASE_ID, phaseTitle: "Unassigned",
      feeAmount: 0, loggedHours: unassignedHours, billedValue: unassignedValue,
      variance: -unassignedValue, utilizationPct: 0,
    });
  }

  return rows.sort(phaseSort);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProjectUtilizationByPhase(client: any, projectId: string): Promise<Result<UtilizationPhaseRow[]>> {
  try {
    const [phasesRes, entriesRes, projectRes] = await Promise.all([
      client.from("fee_phases").select("id, project_id, title, fee_amount, status").eq("project_id", projectId),
      client.from("time_entries").select("id, project_id, hours, billable, rate, phase_id").eq("project_id", projectId),
      client.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
    ]);
    if (phasesRes.error) return dbe(phasesRes.error);
    if (entriesRes.error) return dbe(entriesRes.error);
    if (projectRes.error) return dbe(projectRes.error);

    const projectName = (projectRes.data as { name?: string } | null)?.name ?? "";
    return ok(buildPhaseRows(
      projectId,
      projectName,
      (phasesRes.data ?? []) as Array<Record<string, unknown>>,
      (entriesRes.data ?? []) as Array<Record<string, unknown>>,
    ));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgUtilizationByPhase(client: any, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<UtilizationPhaseRow[]>> {
  try {
    const projects = await listProjectsByType(client, orgId, CONSULTANCY_TYPES, scope);
    if (!projects.ok) return projects;
    if (projects.data.length === 0) return ok([]);
    const ids = projects.data.map(p => p.id);

    const [phasesRes, entriesRes, projectsRes] = await Promise.all([
      client.from("fee_phases").select("id, project_id, title, fee_amount, status").in("project_id", ids),
      client.from("time_entries").select("id, project_id, hours, billable, rate, phase_id").in("project_id", ids),
      client.from("projects").select("id, name").in("id", ids),
    ]);
    if (phasesRes.error) return dbe(phasesRes.error);
    if (entriesRes.error) return dbe(entriesRes.error);
    if (projectsRes.error) return dbe(projectsRes.error);

    const projectNames = new Map<string, string>();
    for (const p of (projectsRes.data ?? []) as Array<Record<string, unknown>>) {
      projectNames.set(String(p.id), String(p.name ?? ""));
    }

    const phases = (phasesRes.data ?? []) as Array<Record<string, unknown>>;
    const entries = (entriesRes.data ?? []) as Array<Record<string, unknown>>;

    // Group phases + entries per project, then run buildPhaseRows once per
    // project so the Unassigned bucket is computed exactly once per project.
    const phasesByProject = new Map<string, Array<Record<string, unknown>>>();
    for (const p of phases) {
      const pid = String(p.project_id);
      if (!phasesByProject.has(pid)) phasesByProject.set(pid, []);
      phasesByProject.get(pid)!.push(p);
    }
    const entriesByProject = new Map<string, Array<Record<string, unknown>>>();
    for (const e of entries) {
      const pid = String(e.project_id);
      if (!entriesByProject.has(pid)) entriesByProject.set(pid, []);
      entriesByProject.get(pid)!.push(e);
    }

    const phaseRows: UtilizationPhaseRow[] = [];
    for (const p of projects.data) {
      phaseRows.push(...buildPhaseRows(
        p.id,
        projectNames.get(p.id) ?? p.name,
        phasesByProject.get(p.id) ?? [],
        entriesByProject.get(p.id) ?? [],
      ));
    }

    const withData = phaseRows.filter(r => r.feeAmount > 0 || r.loggedHours > 0 || r.billedValue > 0);
    return ok(withData.sort(phaseSort));
  } catch (e) { return er(e); }
}
