// SiteTrack Pro — platform audit log queries (legacy audit v1).

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AuditEvent { id: string; time: string; type: string; by: string; role: string; action: string; detail?: string; org_id?: string; project_id?: string; }

export async function listAuditEvents(client: any, limit = 200): Promise<PResult<AuditEvent[]>> {
  try {
    const { data, error } = await client.from("activity_log").select("*").order("time", { ascending: false }).limit(limit);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: data ?? [] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
