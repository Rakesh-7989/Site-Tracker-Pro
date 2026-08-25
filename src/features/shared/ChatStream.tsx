// SiteTrack Pro — shared chat stream used by BOTH surfaces:
//   • the unified /chat hub (org channels, project streams, DMs)
//   • the project DetailView "Messages" tab (embedded project stream)
// Owns messages state, polling, threads, @mention composer, deletes and
// deep-link (?m=) highlight. Access is enforced server-side by RLS.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import {
  listChannelMessages, postChannelMessage, listThreadReplies,
  getChatMessage, deleteChatMessage,
  toggleReaction, markChannelRead, mentionAllIds,
  extractMentionIds, splitOnMentions,
  type ChatChannel, type ChatMessage,
} from "@/app/chatQueries";
import type { MentionCandidate } from "@/app/chatQueries";
import { getClient } from "@/lib/supabase";
import { cn } from "@/lib/cn";

const fmtTs = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Render a message body with @Name tokens highlighted. */
export function MessageBody({ body, names }: { body: string; names: string[] }): JSX.Element {
  const parts = useMemo(() => splitOnMentions(body, names), [body, names]);
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {parts.map((p, i) => p.mention ? (
        <span key={i} className="font-semibold text-accent">{p.mention}</span>
      ) : (
        <span key={i}>{p.text}</span>
      ))}
    </p>
  );
}

export interface ChatStreamProps {
  channel: ChatChannel;
  mentionCandidates: MentionCandidate[];
  /** Deep-linked message id (from /chat?c=&m= notifications). */
  highlightMessageId?: string | null;
}

export function ChatStream({ channel, mentionCandidates, highlightMessageId }: ChatStreamProps): JSX.Element {
  const t = useT();
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canPost = useCan("message:send");
  const canManage = useCan("chat:manage");

  const orgId = activeOrg?.orgId ?? "";
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Threads
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadText, setThreadText] = useState("");
  // Deep-link highlight
  const [hlId, setHlId] = useState<string | null>(null);
  const hlHandledRef = useRef<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const memberNames = useMemo(() => mentionCandidates.map(m => m.name), [mentionCandidates]);
  const myId = session?.user.id ?? null;

  const reloadMsgs = useCallback(async () => {
    setLoadingMsgs(true);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoadingMsgs(false); return; }
    const res = await listChannelMessages(client, channel.id);
    if (res.ok) setMsgs(res.data); else setError(res.error);
    setLoadingMsgs(false);
  }, [channel.id]);

  useEffect(() => { void reloadMsgs(); }, [reloadMsgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);
  useEffect(() => {
    const timer = setInterval(() => { void reloadMsgs(); }, 20000);
    return () => clearInterval(timer);
  }, [reloadMsgs]);

  // Mark-read on open + after every refresh (drives unread badges).
  useEffect(() => {
    if (!session || loadingMsgs) return;
    const clientPromise = getClient();
    void clientPromise.then(client => {
      if (client) void markChannelRead(client, channel.id, session.user.id);
    });
  }, [channel.id, session, loadingMsgs]);

  // ── Mentions autocomplete ────────────────────────────────────────────────
  const onComposerChange = (v: string) => {
    setText(v);
    // eslint-disable-next-line no-misleading-character-class -- Telugu range intentionally includes combining marks for name matching
    const m = /@([A-Za-z\u0C00-\u0C7F][^\s@]*)$/.exec(v);
    setMentionQuery(m ? m[1] : null);
  };
  const mentionOptions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionCandidates.filter(m => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, mentionCandidates]);

  const applyMention = (name: string) => {
    // eslint-disable-next-line no-misleading-character-class -- Telugu range intentionally includes combining marks for name matching
    setText(prev => prev.replace(/@([A-Za-z\u0C00-\u0C7F][^\s@]*)$/, `@${name} `));
    setMentionQuery(null);
  };

  // ── Deep link ?m= : highlight target or open its thread ─────────────────
  useEffect(() => {
    if (!highlightMessageId || hlHandledRef.current === `${channel.id}:${highlightMessageId}` || loadingMsgs) return;
    hlHandledRef.current = `${channel.id}:${highlightMessageId}`;
    void (async () => {
      const inList = msgs.find(x => x.id === highlightMessageId);
      if (inList) {
        setHlId(highlightMessageId);
        document.getElementById(`chat-msg-${highlightMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHlId(null), 4000);
        return;
      }
      const client = await getClient();
      if (!client) return;
      const target = await getChatMessage(client, highlightMessageId);
      if (!target.ok || !target.data || target.data.channelId !== channel.id) return;
      const parentId = target.data.parentId ?? target.data.id;
      const parent = parentId === target.data.id ? target.data
        : await getChatMessage(client, parentId).then(r => r.ok ? r.data : null);
      if (!parent) return;
      setThreadParent(parent); setThreadReplies([]); setThreadLoading(true);
      const replies = await listThreadReplies(client, parent.id);
      if (replies.ok) setThreadReplies(replies.data);
      setThreadLoading(false);
      setHlId(highlightMessageId);
      setTimeout(() => setHlId(null), 6000);
    })();
  }, [highlightMessageId, channel.id, msgs, loadingMsgs]);

  const send = async () => {
    const body = text.trim();
    if (!body || !session || !canPost) return;
    setBusy(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    let mentionIds = extractMentionIds(body, mentionCandidates);
    // "@all" (managers only) → notify every eligible member of the channel.
    if (/@all\b/i.test(body)) {
      const all = await mentionAllIds(client, channel.id);
      if (all.ok) mentionIds = [...new Set([...mentionIds, ...all.data])];
    }
    const res = await postChannelMessage(client, {
      orgId, channelId: channel.id, parentId: null,
      senderId: session.user.id, senderName: session.user.name,
      body, mentionIds,
    });
    if (!res.ok) setError(res.error);
    else { setText(""); setMentionQuery(null); await reloadMsgs(); }
    setBusy(false);
  };

  /** Toggle my emoji reaction on a message. */
  const react = async (m: ChatMessage, emoji: string) => {
    if (!session) return;
    const mineNow = (m.reactions[emoji] ?? []).includes(session.user.id);
    // Optimistic flip.
    setMsgs(prev => prev.map(x => {
      if (x.id !== m.id) return x;
      const cur = new Map(Object.entries(x.reactions).map(([k, v]) => [k, [...v]]));
      let list = cur.get(emoji) ?? [];
      list = mineNow ? list.filter(u => u !== session.user.id) : [...list, session.user.id];
      if (list.length === 0) cur.delete(emoji); else cur.set(emoji, list);
      return { ...x, reactions: Object.fromEntries(cur) };
    }));
    const client = await getClient();
    if (!client) return;
    const res = await toggleReaction(client, m.id, session.user.id, emoji, mineNow);
    if (!res.ok) void reloadMsgs(); // rollback via refetch on failure
  };

  const removeMsg = async (m: ChatMessage) => {
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const prev = msgs;
    setMsgs(list => list.filter(x => x.id !== m.id));
    const res = await deleteChatMessage(client, m.id);
    if (!res.ok) { setMsgs(prev); setError(res.error); }
  };

  // ── Threads ──────────────────────────────────────────────────────────────
  const openThread = async (m: ChatMessage) => {
    setThreadParent(m); setThreadReplies([]); setThreadLoading(true);
    const client = await getClient();
    if (!client) { setThreadLoading(false); setError("Backend not configured."); return; }
    const res = await listThreadReplies(client, m.id);
    if (res.ok) setThreadReplies(res.data); else setError(res.error);
    setThreadLoading(false);
  };

  const sendReply = async () => {
    const body = threadText.trim();
    if (!body || !session || !threadParent) return;
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const mentionIds = extractMentionIds(body, mentionCandidates);
    const res = await postChannelMessage(client, {
      orgId, channelId: threadParent.channelId, parentId: threadParent.id,
      senderId: session.user.id, senderName: session.user.name,
      body, mentionIds,
    });
    if (!res.ok) { setError(res.error); return; }
    setThreadText("");
    const refreshed = await listThreadReplies(client, threadParent.id);
    if (refreshed.ok) setThreadReplies(refreshed.data);
    await reloadMsgs();
    setMsgs(prev => prev.map(x => x.id === threadParent.id
      ? { ...x, replyCount: refreshed.ok ? refreshed.data.length : x.replyCount + 1 }
      : x));
    setThreadParent(t => t ? { ...t, replyCount: refreshed.ok ? refreshed.data.length : t.replyCount + 1 } : t);
  };

  return (
    <div className="flex flex-col min-w-0">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="p-4 space-y-3 min-h-[360px] max-h-[520px] overflow-y-auto bg-panel rounded-t-xl">
        {loadingMsgs ? <div className="grid place-items-center h-48"><Spinner size={20} /></div>
          : msgs.length === 0 ? <div className="text-center py-16 text-fg-tertiary text-sm">{t("teams.noMessagesYet")}</div>
          : msgs.map(m => {
              const mine = m.senderId != null && m.senderId === myId;
              const canDelete = mine || canManage;
              return (
                <div key={m.id} id={`chat-msg-${m.id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={cn(
                    "group max-w-[82%] rounded-2xl px-4 py-3 transition",
                    mine ? "bg-accent text-white" : "bg-panel text-fg-primary border border-default",
                    hlId === m.id && "ring-2 ring-accent",
                  )}>
                    {!mine && <div className="text-xs font-bold text-fg-secondary mb-1">{m.senderName}</div>}
                    <MessageBody body={m.body} names={memberNames} />
                    {/* Reactions */}
                    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                      {Object.entries(m.reactions).map(([emoji, users]) => (
                        <button key={emoji} type="button"
                          onClick={() => void react(m, emoji)}
                          className={cn(
                            "text-[11px] rounded-full px-1.5 py-0.5 border transition",
                            session && users.includes(session.user.id)
                              ? "border-accent bg-accent-tint text-accent font-semibold"
                              : "border-default bg-bg-secondary text-fg-secondary hover:border-accent/50",
                          )}
                          title={users.length === 1 ? "1 reaction" : `${users.length} reactions`}
                        >
                          {emoji} {users.length}
                        </button>
                      ))}
                      <button type="button"
                        onClick={() => void react(m, "👍")}
                        className="text-[11px] text-fg-tertiary hover:text-accent opacity-0 group-hover:opacity-100 focus:opacity-100 transition rounded px-1"
                        aria-label="Add reaction" title="👍"
                      >
                        +
                      </button>
                    </div>
                    <div className={cn("text-[10px] mt-1 flex items-center gap-2", mine ? "text-white/70" : "text-fg-tertiary")}>
                      <span>{fmtTs(m.createdAt)}</span>
                      {canDelete && (
                        <button
                          type="button"
                          title={t("teams.delete")}
                          aria-label={`${t("teams.delete")} message`}
                          onClick={() => void removeMsg(m)}
                          className="hover:text-error transition"
                        >
                          <Icon name="trash" size={11} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void openThread(m)}
                        className="underline hover:no-underline font-semibold"
                      >
                        {m.replyCount > 0 ? t("teams.repliesCount", { count: m.replyCount }) : t("teams.replyInThread")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        <div ref={endRef} />
      </div>

      {canPost && (
        <div className="p-4 border-t border-default relative">
          {mentionOptions.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-1 rounded-xl border border-default bg-bg-primary shadow-lg overflow-hidden z-10" data-testid="mention-menu">
              {mentionOptions.map(m => (
                <button
                  key={m.profileId}
                  type="button"
                  onClick={() => applyMention(m.name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-bg-secondary flex items-center gap-2"
                >
                  <span className="rounded-full bg-violet-tint text-violet w-6 h-6 grid place-items-center text-[10px] font-bold">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center">
            {canManage && (
              <button type="button" onClick={() => setText(p => (p.trim().length ? p + " " : "") + "@all ")}
                className="text-[11px] font-bold rounded-full border border-default px-2 py-1.5 text-fg-secondary hover:border-accent hover:text-accent transition flex-shrink-0"
                title="Notify everyone (managers)">
                @all
              </button>
            )}
            <Input
              className="flex-1"
              placeholder={t("teams.composerPlaceholder")}
              value={text}
              onChange={e => onComposerChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            />
            <Button onClick={() => void send()} disabled={busy || !text.trim()} aria-label={t("teams.send")}>
              {busy ? <Spinner size={14} /> : <Icon name="send" size={16} />}
            </Button>
          </div>
        </div>
      )}

      {/* Thread modal */}
      <Modal
        open={threadParent !== null}
        onClose={() => setThreadParent(null)}
        size="lg"
        title={`${t("teams.threadTitle")} · #${channel.name}`}
        subtitle={threadParent ? t("teams.repliesCount", { count: threadParent.replyCount }) : undefined}
        ariaLabel="Thread replies"
      >
        {threadParent && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-default bg-panel px-4 py-3">
              <div className="text-xs font-bold text-fg-secondary mb-1">{threadParent.senderName}</div>
              <MessageBody body={threadParent.body} names={memberNames} />
              <div className="text-[10px] text-fg-tertiary mt-1">{fmtTs(threadParent.createdAt)}</div>
            </div>
            <div className="max-h-[280px] overflow-y-auto space-y-3">
              {threadLoading ? <div className="grid place-items-center py-8"><Spinner size={18} /></div>
                : threadReplies.map(r => (
                  <div key={r.id} id={`chat-msg-${r.id}`} className={cn("px-1 rounded-lg", hlId === r.id && "ring-2 ring-accent")}>
                    <div className="text-xs font-bold text-fg-secondary">{r.senderName}</div>
                    <MessageBody body={r.body} names={memberNames} />
                    <div className="text-[10px] text-fg-tertiary mt-0.5">{fmtTs(r.createdAt)}</div>
                  </div>
                ))}
            </div>
            {canPost && (
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder={t("teams.replyPlaceholder")}
                  value={threadText}
                  onChange={e => setThreadText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                />
                <Button onClick={() => void sendReply()} disabled={!threadText.trim()} aria-label={t("teams.sendReply")}>
                  <Icon name="send" size={16} />
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
