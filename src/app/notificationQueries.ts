// SiteTrack Pro — notifications inbox queries. RLS scopes every row to the
// current user (migration 89 GRANT). The unread badge uses an RPC.

export type NResult<T> = { ok: true; data: T } | { ok: false; error: string };
export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listNotifications(client: any, limit = 50): Promise<NResult<Notification[]>> {
  try {
    const { data, error } = await client.from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), kind: String(r.kind ?? ""), title: String(r.title ?? ""),
      body: r.body == null ? null : String(r.body), link: r.link == null ? null : String(r.link),
      readAt: r.read_at == null ? null : String(r.read_at), createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function markRead(client: any, id: string): Promise<NResult<{ ok: true }>> {
  try { const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id); if (error) return { ok: false, error: String(error.message ?? error) }; return { ok: true, data: { ok: true } }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function markAllRead(client: any): Promise<NResult<{ ok: true }>> {
  try { const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); if (error) return { ok: false, error: String(error.message ?? error) }; return { ok: true, data: { ok: true } }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function unreadCount(client: any): Promise<number> {
  try { const { data, error } = await client.rpc("unread_notification_count"); if (error) return 0; return Number(data) || 0; } catch { return 0; }
}
