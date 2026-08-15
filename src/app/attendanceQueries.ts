// SiteTrack Pro — attendance queries (v3 port, Batch 2/3). DB-wired to
// `attendance` via the migration 73 bridge.

export type AttendanceStatus = "present" | "absent" | "half_day" | "leave" | "on_site_late" | "off_site";
export type AttendeeKind = "labour" | "staff" | "visitor";

export interface AttendanceRow {
  id: string;
  attendeeName: string;
  kind: AttendeeKind;
  date: string;
  status: AttendanceStatus;
  hours: number | null;
  overtime: number | null;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const STATUSES: AttendanceStatus[] = ["present", "absent", "half_day", "leave", "on_site_late", "off_site"];
const KINDS: AttendeeKind[] = ["labour", "staff", "visitor"];
const asStatus = (v: unknown): AttendanceStatus => (STATUSES.includes(v as AttendanceStatus) ? (v as AttendanceStatus) : "present");
const asKind = (v: unknown): AttendeeKind => (KINDS.includes(v as AttendeeKind) ? (v as AttendeeKind) : "labour");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listAttendance(client: any, projectId: string): Promise<Result<AttendanceRow[]>> {
  try {
    const { data, error } = await client
      .from("attendance")
      .select("id, attendee_name, attendee_kind, date, status, hours, overtime")
      .eq("project_id", projectId)
      .order("date", { ascending: false })
      .order("attendee_name", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return {
      ok: true,
      data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
        id: String(r.id),
        attendeeName: String(r.attendee_name ?? ""),
        kind: asKind(r.attendee_kind),
        date: String(r.date ?? ""),
        status: asStatus(r.status),
        hours: r.hours == null ? null : Number(r.hours),
        overtime: r.overtime == null ? null : Number(r.overtime),
      })),
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function createAttendance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { projectId: string; attendeeName: string; kind: AttendeeKind; status: AttendanceStatus; hours?: number | null; overtime?: number | null; date?: string; recordedBy: string },
): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("attendance").insert({
      project_id: input.projectId,
      attendee_kind: input.kind,
      attendee_name: input.attendeeName,
      status: input.status,
      ...(input.hours != null ? { hours: input.hours } : {}),
      ...(input.overtime != null ? { overtime: input.overtime } : {}),
      ...(input.date ? { date: input.date } : {}),
      recorded_by: input.recordedBy,
    }).select("id").single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setAttendanceStatus(client: any, id: string, status: AttendanceStatus): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from("attendance").update({ status }).eq("id", id); if (error) return { ok: false, error: String(error.message ?? error) }; return { ok: true, data: { ok: true } }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteAttendance(client: any, id: string): Promise<Result<{ ok: true }>> {
  try { const { error } = await client.from("attendance").delete().eq("id", id); if (error) return { ok: false, error: String(error.message ?? error) }; return { ok: true, data: { ok: true } }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// Kiosk clock-out via the SECURITY DEFINER RPC (migration 197). Any project
// member can clock a checked-in worker out; direct attendance_update stays
// PM+ for corrections. This is what the Labour kiosk calls instead of a raw
// UPDATE (which a non-PM kiosk operator could not run — 42501).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clockOutAttendance(client: any, id: string, outTime: string, hours: number): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.rpc("kiosk_clock_out", { p_attendance_id: id, p_out_time: outTime, p_hours: hours });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
