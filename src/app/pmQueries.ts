// SiteTrack Pro — PM Dashboard queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ProjectBrief { id: string; name: string; location: string | null; status: string; progress: number; }
export interface NotifBrief { id: string; title: string; message: string; }

export async function listPMProjects(client: any): Promise<PResult<ProjectBrief[]>> {
  try {
    const { data, error } = await client.from("projects").select("id, name, location, status, progress").order("name");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, name: r.name, location: r.location, status: r.status, progress: r.progress ?? 0 })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listPMNotifications(client: any): Promise<PResult<NotifBrief[]>> {
  try {
    const { data, error } = await client.from("notifications").select("id, title, message").order("created_at", { ascending: false }).limit(10);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", message: r.message ?? "" })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
