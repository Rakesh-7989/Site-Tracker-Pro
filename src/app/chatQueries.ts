// SiteTrack Pro — Teams P1: org-scoped chat channels + threads + mentions.
// DB-wired to chat_channels / chat_messages (migration 229). Threads are one
// level deep (parent_id NULL = top-level); reply_count is trigger-maintained.
// Mentions are resolved client-side against the org member list and stored as
// uuid[]; the notify_chat_mentions trigger fans out notifications server-side.

export type CResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  parentId: string | null;
  senderId: string | null;
  senderName: string;
  body: string;
  mentions: string[];
  replyCount: number;
  createdAt: string;
}

const CHAT_SELECT = "id, channel_id, parent_id, sender_id, sender_name, body, mentions, reply_count, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessage(r: Record<string, unknown>): ChatMessage {
  return {
    id: String(r.id),
    channelId: String(r.channel_id ?? ""),
    parentId: r.parent_id == null ? null : String(r.parent_id),
    senderId: r.sender_id == null ? null : String(r.sender_id),
    senderName: String(r.sender_name ?? "Member"),
    body: String(r.body ?? ""),
    mentions: Array.isArray(r.mentions) ? (r.mentions as unknown[]).map(String) : [],
    replyCount: Number(r.reply_count ?? 0),
    createdAt: String(r.created_at ?? ""),
  };
}

export async function listChannels(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  orgId: string,
): Promise<CResult<ChatChannel[]>> {
  try {
    const { data, error } = await client.from("chat_channels")
      .select("id, name, description, is_archived, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      description: r.description == null ? null : String(r.description),
      isArchived: Boolean(r.is_archived),
      createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function createChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string; name: string; description?: string },
): Promise<CResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Channel name is required." };
  try {
    const { data, error } = await client.from("chat_channels")
      .insert({
        org_id: input.orgId,
        name,
        ...(input.description && input.description.trim() ? { description: input.description.trim() } : {}),
        // created_by is filled by the DB default (auth.uid()).
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function setChannelArchived(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  channelId: string,
  archived: boolean,
): Promise<CResult<{ ok: true }>> {
  try {
    const { error } = await client.from("chat_channels").update({ is_archived: archived }).eq("id", channelId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function deleteChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  channelId: string,
): Promise<CResult<{ ok: true }>> {
  try {
    const { error } = await client.from("chat_channels").delete().eq("id", channelId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Top-level messages of a channel, oldest-first. */
export async function listChannelMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  channelId: string,
  limit = 200,
): Promise<CResult<ChatMessage[]>> {
  try {
    const { data, error } = await client.from("chat_messages")
      .select(CHAT_SELECT)
      .eq("channel_id", channelId)
      .is("parent_id", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapMessage) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function postChannelMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: {
    orgId: string;
    channelId: string;
    parentId?: string | null;
    senderId: string | null;
    senderName: string;
    body: string;
    mentionIds?: string[];
  },
): Promise<CResult<{ id: string }>> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Message cannot be empty." };
  try {
    const { data, error } = await client.from("chat_messages")
      .insert({
        org_id: input.orgId,
        channel_id: input.channelId,
        parent_id: input.parentId ?? null,
        sender_id: input.senderId,
        sender_name: input.senderName,
        body,
        mentions: input.mentionIds ?? [],
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Thread replies for a top-level message, oldest-first. */
export async function listThreadReplies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  messageId: string,
): Promise<CResult<ChatMessage[]>> {
  try {
    const { data, error } = await client.from("chat_messages")
      .select(CHAT_SELECT)
      .eq("parent_id", messageId)
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapMessage) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Fetch one message by id (deep-link / mention-notification targets). */
export async function getChatMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  messageId: string,
): Promise<CResult<ChatMessage | null>> {
  try {
    const { data, error } = await client.from("chat_messages")
      .select(CHAT_SELECT)
      .eq("id", messageId)
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: data ? mapMessage(data as Record<string, unknown>) : null };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Delete a message (own — or any, for managers; RLS enforces). */
export async function deleteChatMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  messageId: string,
): Promise<CResult<{ ok: true }>> {
  try {
    const { error } = await client.from("chat_messages").delete().eq("id", messageId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ─── Pure mention helpers ────────────────────────────────────────────────────

export interface MentionCandidate {
  profileId: string;
  name: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve "@Name" tokens in `body` against the member list and return the
 * mentioned profile ids (unique, first-appearance order). Longest names win
 * when one name contains another ("@Ravi Kumar" beats "@Ravi"); overlapping
 * matches never double-count.
 */
export function extractMentionIds(body: string, members: MentionCandidate[]): string[] {
  const ids: string[] = [];
  if (!body || body.indexOf("@") === -1 || members.length === 0) return ids;
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => taken.some(([ts, te]) => s < te && e > ts);
  const sorted = [...members]
    .map(m => ({ ...m, name: m.name.trim() }))
    .filter(m => m.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const re = new RegExp("@" + escapeRegExp(m.name), "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      if (match[0].length === 0) break; // zero-length guard
      const s = match.index;
      const e = s + match[0].length;
      if (!overlaps(s, e)) {
        taken.push([s, e]);
        if (!ids.includes(m.profileId)) ids.push(m.profileId);
      }
    }
  }
  return ids;
}

export interface MessagePart {
  text: string;
  /** Present when this segment is the "@Name" token itself. */
  mention?: string;
}

/**
 * Split a message body into plain-text and @mention segments for highlight
 * rendering. Longest-name-first, non-overlapping (mirrors extractMentionIds).
 */
export function splitOnMentions(body: string, names: string[]): MessagePart[] {
  if (!body || body.indexOf("@") === -1 || names.length === 0) {
    return body ? [{ text: body }] : [];
  }
  const hits: Array<{ start: number; end: number; token: string }> = [];
  const overlaps = (s: number, e: number) => hits.some(h => s < h.end && e > h.start);
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const re = new RegExp("@" + escapeRegExp(name), "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      if (match[0].length === 0) break;
      const s = match.index;
      const e = s + match[0].length;
      if (!overlaps(s, e)) hits.push({ start: s, end: e, token: match[0] });
    }
  }
  if (hits.length === 0) return [{ text: body }];
  hits.sort((a, b) => a.start - b.start);
  const parts: MessagePart[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) parts.push({ text: body.slice(cursor, h.start) });
    parts.push({ text: h.token, mention: h.token });
    cursor = h.end;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) });
  return parts;
}
