// SiteTrack Pro — project messages (discussion) queries. Append-only chat,
// DB-wired to the messages table (migration 90 bridge: read + post for project
// members).

export type MResult<T> = { ok: true; data: T } | { ok: false; error: string };
export interface Message {
  id: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMessages(client: any, projectId: string, limit = 100): Promise<MResult<Message[]>> {
  try {
    const { data, error } = await client.from("messages")
      .select("id, sender_id, sender_name, body, created_at")
      .eq("project_id", projectId).order("created_at", { ascending: true }).limit(limit);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), senderId: r.sender_id == null ? null : String(r.sender_id),
      senderName: String(r.sender_name ?? "Member"), body: String(r.body ?? ""), createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postMessage(client: any, input: { projectId: string; body: string; senderId: string; senderName: string }): Promise<MResult<{ id: string }>> {
  try {
    const { data, error } = await client.from("messages")
      .insert({ project_id: input.projectId, sender_id: input.senderId, sender_name: input.senderName, body: input.body })
      .select("id").single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
