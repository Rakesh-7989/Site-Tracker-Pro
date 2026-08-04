// SiteTrack Pro — org calendar queries. Unified dated items (milestones +
// tasks) across the org's projects via the org_calendar RPC (migration 85).

export type CalResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type CalKind = "milestone" | "task" | "noc";
export interface CalItem {
  kind: CalKind;
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgCalendar(client: any, orgId: string): Promise<CalResult<CalItem[]>> {
  try {
    const { data, error } = await client.rpc("org_calendar", { p_org: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      kind: (r.kind === "task" ? "task" : r.kind === "noc" ? "noc" : "milestone") as CalKind,
      id: String(r.id), projectId: String(r.project_id), projectName: String(r.project_name ?? ""),
      title: String(r.title ?? ""), dueDate: String(r.due_date ?? "").slice(0, 10), status: String(r.status ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Group items into Overdue / Today / Upcoming buckets relative to `todayISO`. */
export function bucketByDate(items: CalItem[], todayISO: string): { overdue: CalItem[]; today: CalItem[]; upcoming: Map<string, CalItem[]> } {
  const overdue: CalItem[] = [];
  const today: CalItem[] = [];
  const upcoming = new Map<string, CalItem[]>();
  for (const it of items) {
    const done = it.status === "completed";
    if (it.dueDate < todayISO && !done) overdue.push(it);
    else if (it.dueDate === todayISO) today.push(it);
    else if (it.dueDate > todayISO) { const a = upcoming.get(it.dueDate) ?? []; a.push(it); upcoming.set(it.dueDate, a); }
  }
  return { overdue, today, upcoming };
}
