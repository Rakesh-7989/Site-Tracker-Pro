// SiteTrack Pro — site-update (daily diary) queries (v3 port, Batch 1).
// DB-wired to `site_updates`.

export interface SiteUpdate {
  id: string;
  notes: string;
  weather: string | null;
  workersCount: number | null;
  updateDate: string;
  authorName: string | null;
}

export type UQResult<T> = { ok: true; data: T } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUpdates(client: any, projectId: string): Promise<UQResult<SiteUpdate[]>> {
  try {
    const { data, error } = await client
      .from("site_updates")
      .select("id, notes, weather, workers_count, update_date, profiles:author_id (name)")
      .eq("project_id", projectId)
      .order("update_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => {
      const prof = r.profiles as Record<string, unknown> | undefined;
      return {
        id: String(r.id),
        notes: String(r.notes ?? ""),
        weather: r.weather == null ? null : String(r.weather),
        workersCount: r.workers_count == null ? null : Number(r.workers_count),
        updateDate: String(r.update_date ?? ""),
        authorName: prof?.name == null ? null : String(prof.name),
      };
    });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { projectId: string; authorId: string; notes: string; weather?: string; workersCount?: number | null },
): Promise<UQResult<{ id: string }>> {
  try {
    const { data, error } = await client.from("site_updates").insert({
      project_id: input.projectId,
      author_id: input.authorId,
      notes: input.notes,
      ...(input.weather ? { weather: input.weather } : {}),
      ...(input.workersCount != null ? { workers_count: input.workersCount } : {}),
    }).select("id").single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteUpdate(client: any, id: string): Promise<UQResult<{ ok: true }>> {
  try {
    const { error } = await client.from("site_updates").delete().eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
