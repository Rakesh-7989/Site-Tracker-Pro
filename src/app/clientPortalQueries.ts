// SiteTrack Pro — Client Portal queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ProjectBrief { id: string; name: string; location: string | null; status: string; progress: number; client_email: string | null; type: string; }
export interface NotificationBrief { id: string; title: string; body: string; read: boolean; }

export async function listClientProjects(client: any, email: string): Promise<PResult<ProjectBrief[]>> {
  try {
    const { data, error } = await client.from("projects")
      .select("id, name, location, status, progress, client_email, type")
      .eq("client_email", email)
      .order("name");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, name: r.name, location: r.location, status: r.status, progress: r.progress ?? 0, client_email: r.client_email, type: r.type ?? "construction" })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listClientNotifications(client: any): Promise<PResult<NotificationBrief[]>> {
  try {
    const { data, error } = await client.from("notifications")
      .select("id, title, body, read_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", body: r.body ?? "", read: r.read_at != null })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
