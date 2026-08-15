// SiteTrack Pro — consultancy billable time entries (v4 C1).
// DB: time_entries (migrations 137 + 141). RLS: read = project member,
// insert = self, edit/delete = self or org admin (self edits lock once an
// entry is approved — app-layer enforced). UI gating via time:log (self) /
// time:manage (admins, heads); approvals run through the manager-gated
// approve_time_entry RPC (time:approve).

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

/** Time-entry approval lifecycle (v4 C2). */
export type ApprovalStatus = "pending" | "approved" | "rejected";
export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "rejected"];
const asApprovalStatus = oneOf<ApprovalStatus>(APPROVAL_STATUSES, "pending");

export interface TimeEntry {
  id: string;
  profileId: string;
  memberName: string | null;
  date: string;
  activity: string;
  hours: number;
  billable: boolean;
  rate: number | null;
  notes: string | null;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  billed: boolean;
  billedInvoiceId: string | null;
  createdAt: string;
  phaseId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listTimeEntries(client: any, projectId: string): Promise<Result<TimeEntry[]>> {
  try {
    const { data, error } = await client
      .from("time_entries")
      .select("id, profile_id, date, activity, hours, billable, rate, notes, approval_status, approved_by, approved_at, billed, billed_invoice_id, created_at, profile:profile_id(name), phase_id")
      .eq("project_id", projectId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      profileId: String(r.profile_id ?? ""),
      memberName: (r.profile as { name?: string } | null | undefined)?.name ?? null,
      date: String(r.date ?? ""),
      activity: String(r.activity ?? ""),
      hours: Number(r.hours ?? 0),
      billable: Boolean(r.billable),
      rate: r.rate == null ? null : Number(r.rate),
      notes: r.notes == null ? null : String(r.notes),
      approvalStatus: asApprovalStatus(r.approval_status),
      approvedBy: r.approved_by == null ? null : String(r.approved_by),
      approvedAt: r.approved_at == null ? null : String(r.approved_at),
      billed: Boolean(r.billed),
      billedInvoiceId: r.billed_invoice_id == null ? null : String(r.billed_invoice_id),
      createdAt: String(r.created_at ?? ""),
      phaseId: r.phase_id == null ? null : String(r.phase_id),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createTimeEntry(client: any, input: {
  projectId: string; profileId: string; date: string; activity: string;
  hours: number; billable?: boolean; rate?: number | null; notes?: string;
  phaseId?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("time_entries")
      .insert({
        project_id: input.projectId, profile_id: input.profileId, date: input.date,
        activity: input.activity, hours: input.hours, billable: input.billable ?? true,
        rate: input.rate ?? null, notes: input.notes || null,
        phase_id: input.phaseId || null,
      })
      .select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateTimeEntry(client: any, id: string, patch: {
  date?: string; activity?: string; hours?: number; billable?: boolean;
  rate?: number | null; notes?: string | null;
  phaseId?: string | null;
}): Promise<Result<{ ok: true }>> {
  try {
    const row: Record<string, unknown> = {};
    if (patch.date !== undefined) row.date = patch.date;
    if (patch.activity !== undefined) row.activity = patch.activity;
    if (patch.hours !== undefined) row.hours = patch.hours;
    if (patch.billable !== undefined) row.billable = patch.billable;
    if (patch.rate !== undefined) row.rate = patch.rate;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.phaseId !== undefined) row.phase_id = patch.phaseId || null;
    const { error } = await client.from("time_entries").update(row).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteTimeEntry(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("time_entries").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// Manager-gated approve_time_entry RPC (v4 C2, time:approve).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function approveTimeEntry(client: any, entryId: string, status: ApprovalStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.rpc("approve_time_entry", { p_entry_id: entryId, p_status: status });
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Total logged hours (all billable flags) for a list of entries. */
export function totalHours(entries: TimeEntry[]): number {
  return entries.reduce((s, e) => s + (Number.isFinite(e.hours) ? e.hours : 0), 0);
}

/** Billable hours only. */
export function billableHours(entries: TimeEntry[]): number {
  return entries.filter(e => e.billable).reduce((s, e) => s + (Number.isFinite(e.hours) ? e.hours : 0), 0);
}

/** Billed value of a time entry = hours × rate (0 when rate is unset). */
export function entryValue(e: TimeEntry): number {
  return e.billable && e.rate != null ? e.hours * e.rate : 0;
}
