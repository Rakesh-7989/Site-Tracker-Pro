// SiteTrack Pro — v4 Phase G3: labour wages — shift roster + overtime + wage slip.
// Layer over migrations 169 (shift_roster table + attendance.overtime) and
// the existing labour_register (wage/epf/esi from 01_schema). Mirrors the
// attendanceQueries / siteAdminQueries pattern: client-injected Result<T>,
// camelCase mappers, pure helpers.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type ShiftName = "day" | "night" | "general" | "special";
export interface ShiftRoster {
  id: string; labourId: string | null; workerName: string | null; shiftDate: string;
  shiftName: ShiftName; startTime: string | null; endTime: string | null; notes: string | null;
}
const asShift = oneOf<ShiftName>(["day", "night", "general", "special"], "day");

export const SHIFT_LABEL: Record<ShiftName, string> = { day: "Day", night: "Night", general: "General", special: "Special" };
export const OVER_TIME_MULTIPLIER = 1.5; // common OT premium on the daily-wage hourly rate
export const SHIFT_BASE_HOURS = 8;

export interface WageInput {
  dailyWage: number;
  presentDays: number;   // full present days (half_day counts 0.5)
  overtimeHours: number; // extra hours (from attendance.overtime)
}

export interface WageSlip {
  baseDays: number; baseAmount: number;
  otHours: number; otAmount: number;
  gross: number; epf: number; esi: number; net: number;
}

/** Pure: daily wage → gross base (presentDays × dailyWage). */
export function baseWage(w: WageInput): number {
  const days = Math.max(0, w.presentDays);
  const rate = Math.max(0, w.dailyWage);
  return days * rate;
}

/** Pure: overtime amount = OT hours × (dailyWage / base hours) × multiplier. */
export function overtimeAmount(w: WageInput): number {
  const rate = Math.max(0, w.dailyWage);
  const h = Math.max(0, w.overtimeHours);
  const hourly = rate / SHIFT_BASE_HOURS;
  return h * hourly * OVER_TIME_MULTIPLIER;
}

/** Pure: standard statutory deductions on gross, clamped ≥ 0. Kept simple;
 * real EPF/ESI % vary by monthly wage slab — UI labels this as an estimate. */
export function statutoryDeductions(gross: number): { epf: number; esi: number } {
  const g = Math.max(0, gross);
  return { epf: Math.round(g * 0.12 * 100) / 100, esi: Math.round(g * 0.0075 * 100) / 100 };
}

/** Pure: full wage slip for a worker for a billing period. */
export function wageSlip(w: WageInput): WageSlip {
  const baseAmount = baseWage(w);
  const otAmount2 = overtimeAmount(w);
  const gross = baseAmount + otAmount2;
  const { epf, esi } = statutoryDeductions(gross);
  return {
    baseDays: Math.max(0, w.presentDays), baseAmount, otHours: Math.max(0, w.overtimeHours), otAmount: otAmount2,
    gross, epf, esi, net: Math.max(0, gross - epf - esi),
  };
}

/** Pure: attendance rows → per-attendee present-day tally + overtime hours.
 *  present counts status present/on_site_late as 1, half_day as 0.5; others 0. */
export function attendanceTally(rows: Array<{ attendeeName: string; status: string; overtime?: number | null }>): Record<string, { presentDays: number; overtimeHours: number }> {
  const out: Record<string, { presentDays: number; overtimeHours: number }> = {};
  for (const r of rows) {
    const key = r.attendeeName;
    const cur = out[key] ?? { presentDays: 0, overtimeHours: 0 };
    if (r.status === "present" || r.status === "on_site_late") cur.presentDays += 1;
    else if (r.status === "half_day") cur.presentDays += 0.5;
    if (r.overtime != null) cur.overtimeHours += Number(r.overtime) || 0;
    out[key] = cur;
  }
  return out;
}

// ── Query mappers ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listShiftRoster(client: any, projectId: string): Promise<Result<ShiftRoster[]>> {
  try {
    const { data, error } = await client.from("shift_roster")
      .select("id, labour_id, worker_name, shift_date, shift_name, start_time, end_time, notes")
      .eq("project_id", projectId)
      .order("shift_date", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), labourId: r.labour_id == null ? null : String(r.labour_id), workerName: r.worker_name == null ? null : String(r.worker_name),
      shiftDate: String(r.shift_date ?? ""), shiftName: asShift(r.shift_name), startTime: r.start_time == null ? null : String(r.start_time),
      endTime: r.end_time == null ? null : String(r.end_time), notes: r.notes == null ? null : String(r.notes),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createShiftRoster(client: any, input: { projectId: string; workerName: string; shiftDate: string; shiftName?: ShiftName; startTime?: string; endTime?: string; notes?: string }): Promise<Result<{ id: string }>> {
   
  const chain = client.from("shift_roster").insert({
    project_id: input.projectId, worker_name: input.workerName, shift_date: input.shiftDate, shift_name: input.shiftName || "day",
    start_time: input.startTime || null, end_time: input.endTime || null, notes: input.notes || null,
  });
  return chainInsert(chain);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chainInsert(chain: any): Promise<Result<{ id: string }>> {
  try { const { data, error } = await chain.select("id").single(); if (error) return dbe(error); return { ok: true, data: { id: String(data.id) } }; } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteShiftRoster = (client: any, id: string) => simpleDelete(client, "shift_roster", id);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function simpleDelete(client: any, table: string, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from(table).delete().eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}