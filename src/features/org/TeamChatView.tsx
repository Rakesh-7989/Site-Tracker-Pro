// SiteTrack Pro — Teams (org chat channels) at /teams — Cliq-style P1.
// Left rail: channel list + create/archive (chat:manage). Main: message
// stream with threads (reply drawer) and an @mention autocomplete composer.
// Project-scoped chat stays in MessagesTab / /messages; this is org-wide.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import {
  listChannels, createChannel, setChannelArchived, deleteChannel,
  listChannelMessages, postChannelMessage, listThreadReplies,
  extractMentionIds, splitOnMentions,
  type ChatChannel, type ChatMessage,
} from "@/app/chatQueries";
import type { MentionCandidate } from "@/app/chatQueries";
import { listOrgMembers } from "@/app/orgMemberQueries";
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

export function TeamChatView(): JSX.Element {
  const t = useT();
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canPost = useCan("message:send");
  const canManage = useCan("chat:manage");
  const [params] = useSearchParams();

  const orgId = activeOrg?.orgId ?? "";
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<MentionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // New-channel form
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  // Threads
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadText, setThreadText] = useState("");
  // Mentions autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const memberNames = useMemo(() => members.map(m => m.name), [members]);

  const reloadChannels = useCallback(async () => {
    if (!orgId) return;
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listChannels(client, orgId);
    if (res.ok) setChannels(res.data); else setError(res.error);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void reloadChannels(); }, [reloadChannels]);

  // Mention candidates = active org members (list_org_members RPC).
  useEffect(() => {
    if (!orgId || !session) return;
    let cancelled = false;
    (async () => {
      const client = await getClient();
      if (!client || cancelled) return;
      const res = await listOrgMembers(client, orgId);
      if (!cancelled && res.ok) {
        setMembers(res.data.filter(m => m.active).map(m => ({ profileId: m.profileId, name: m.name })));
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, session]);

  // Deep link ?c=<channelId> (from mention notifications).
  useEffect(() => {
    const c = params.get("c");
    if (c) setActiveId(c);
  }, [params]);

  // Pick the first channel once loaded (deep link wins).
  useEffect(() => {
    if (!activeId && channels.length > 0) setActiveId(channels[0].id);
  }, [channels, activeId]);

  const reloadMsgs = useCallback(async (channelId: string) => {
    if (!channelId) return;
    setLoadingMsgs(true);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoadingMsgs(false); return; }
    const res = await listChannelMessages(client, channelId);
    if (res.ok) setMsgs(res.data); else setError(res.error);
    setLoadingMsgs(false);
  }, []);

  useEffect(() => { if (activeId) void reloadMsgs(activeId); }, [activeId, reloadMsgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);
  // Light poll so teammates' messages appear without websockets.
  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(() => { void reloadMsgs(activeId); }, 20000);
    return () => clearInterval(timer);
  }, [activeId, reloadMsgs]);

  const active = channels.find(c => c.id === activeId) ?? null;
  const myId = session?.user.id ?? null;

  // ── Mentions autocomplete ────────────────────────────────────────────────
  const onComposerChange = (v: string) => {
    setText(v);
    const m = /@([A-Za-z\u0C00-\u0C7F][^\s@]*)$/.exec(v);
    setMentionQuery(m ? m[1] : null);
  };
  const mentionOptions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members]);

  const applyMention = (name: string) => {
    setText(prev => prev.replace(/@([A-Za-z\u0C00-\u0C7F][^\s@]*)$/, `@${name} `));
    setMentionQuery(null);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !session || !activeId || !canPost) return;
    setBusy(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const mentionIds = extractMentionIds(body, members);
    const res = await postChannelMessage(client, {
      orgId, channelId: activeId, parentId: null,
      senderId: session.user.id, senderName: session.user.name,
      body, mentionIds,
    });
    if (!res.ok) setError(res.error);
    else { setText(""); setMentionQuery(null); await reloadMsgs(activeId); }
    setBusy(false);
  };

  // ── Channel admin ────────────────────────────────────────────────────────
  const addChannel = async () => {
    if (!newName.trim() || !orgId) return;
    setBusy(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const res = await createChannel(client, { orgId, name: newName.trim(), description: newDesc.trim() || undefined });
    if (res.ok) {
      setShowNew(false); setNewName(""); setNewDesc("");
      await reloadChannels();
      setActiveId(res.data.id);
    } else setError(res.error);
    setBusy(false);
  };

  const archive = async (c: ChatChannel) => {
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await setChannelArchived(client, c.id, !c.isArchived);
    if (res.ok) await reloadChannels(); else setError(res.error);
  };

  const remove = async (c: ChatChannel) => {
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await deleteChannel(client, c.id);
    if (res.ok) {
      if (activeId === c.id) setActiveId("");
      await reloadChannels();
    } else setError(res.error);
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
    const mentionIds = extractMentionIds(body, members);
    const res = await postChannelMessage(client, {
      orgId, channelId: threadParent.channelId, parentId: threadParent.id,
      senderId: session.user.id, senderName: session.user.name,
      body, mentionIds,
    });
    if (!res.ok) { setError(res.error); return; }
    setThreadText("");
    const refreshed = await listThreadReplies(client, threadParent.id);
    if (refreshed.ok) setThreadReplies(refreshed.data);
    await reloadMsgs(threadParent.channelId);
    // Refresh the parent row's reply_count badge.
    setMsgs(prev => prev.map(x => x.id === threadParent.id
      ? { ...x, replyCount: refreshed.ok ? refreshed.data.length : x.replyCount + 1 }
      : x));
  };

  const visibleChannels = channels.filter(c => !c.isArchived);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-fg-primary flex items-center gap-2">
            <Icon name="users" size={22} className="text-accent" />{t("teams.title")}
          </h1>
          <p className="text-fg-tertiary text-sm mt-1">{t("teams.subtitle")}</p>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setShowNew(v => !v)}>
            <Icon name="plus" size={14} /><span className="ml-1">{t("teams.newChannel")}</span>
          </Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {showNew && canManage && (
        <Card className="p-3 mb-4 grid gap-2 sm:grid-cols-[200px_1fr_auto] items-end">
          <Input placeholder={t("teams.namePlaceholder")} value={newName} onChange={e => setNewName(e.target.value)} />
          <Input placeholder={t("teams.descPlaceholder")} value={newDesc} onChange={e => setNewDesc(e.target.value)} />
          <Button onClick={() => void addChannel()} disabled={busy || !newName.trim()}>
            {busy ? <Spinner size={14} /> : t("teams.create")}
          </Button>
        </Card>
      )}

      {visibleChannels.length === 0 ? (
        <EmptyChannels canManage={canManage} onCreate={canManage ? () => setShowNew(true) : undefined} />
      ) : (
        <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
          {/* Channel rail */}
          <Card padding="sm" className="md:sticky md:top-20">
            <div className="space-y-0.5">
              {visibleChannels.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "w-full text-left rounded-lg px-2.5 py-1.5 text-sm flex items-center justify-between gap-2 group",
                    c.id === activeId ? "bg-accent-tint text-accent font-semibold" : "hover:bg-bg-secondary text-fg-secondary",
                  )}
                >
                  <span className="truncate">#{c.name}</span>
                  {canManage && c.id === activeId && (
                    <span className="flex-shrink-0 flex items-center gap-1 opacity-70 group-hover:opacity-100">
                      <button type="button" aria-label={`${t("teams.archive")} #${c.name}`} title={t("teams.archive")} onClick={e => { e.stopPropagation(); void archive(c); }}>
                        <Icon name="lock" size={12} />
                      </button>
                      <button type="button" aria-label={`${t("teams.delete")} #${c.name}`} title={t("teams.delete")} onClick={e => { e.stopPropagation(); void remove(c); }}>
                        <Icon name="trash" size={12} className="text-error" />
                      </button>
                    </span>
                  )}
                </button>
              ))}
            </div>
            {channels.some(c => c.isArchived) && (
              <div className="mt-2 pt-2 border-t border-default space-y-0.5">
                {channels.filter(c => c.isArchived).map(c => (
                  <div key={c.id} className="px-2.5 py-1 text-xs text-fg-tertiary truncate line-through opacity-60">#{c.name}</div>
                ))}
              </div>
            )}
          </Card>

          {/* Stream */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-default flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <div className="font-bold text-fg-primary truncate">#{active?.name ?? ""}</div>
                <div className="text-xs text-fg-tertiary truncate">{active?.description || `${msgs.length} messages`}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => activeId && void reloadMsgs(activeId)} title="Refresh">
                <Icon name="refresh" size={14} />
              </Button>
            </div>

            <div className="p-4 space-y-3 min-h-[360px] max-h-[520px] overflow-y-auto bg-panel">
              {loadingMsgs ? <div className="grid place-items-center h-48"><Spinner size={20} /></div>
                : msgs.length === 0 ? <div className="text-center py-16 text-fg-tertiary text-sm">{t("teams.noMessagesYet")}</div>
                : msgs.map(m => {
                    const mine = m.senderId != null && m.senderId === myId;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={cn("max-w-[82%] rounded-2xl px-4 py-3", mine ? "bg-accent text-white" : "bg-panel text-fg-primary border border-default")}>
                          {!mine && <div className="text-xs font-bold text-fg-secondary mb-1">{m.senderName}</div>}
                          <MessageBody body={m.body} names={memberNames} />
                          <div className={cn("text-[10px] mt-1 flex items-center gap-2", mine ? "text-white/70" : "text-fg-tertiary")}>
                            <span>{fmtTs(m.createdAt)}</span>
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

            {canPost && activeId && (
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
                <div className="flex gap-2">
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
          </Card>
        </div>
      )}

      {/* Thread modal */}
      <Modal
        open={threadParent !== null}
        onClose={() => setThreadParent(null)}
        size="lg"
        title={`${t("teams.threadTitle")} · #${active?.name ?? ""}`}
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
                  <div key={r.id} className="px-1">
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

function EmptyChannels({ canManage, onCreate }: { canManage: boolean; onCreate?: () => void }): JSX.Element {
  const t = useT();
  return (
    <div className="text-center py-20">
      <Icon name="users" size={48} className="mx-auto mb-3 text-fg-tertiary" />
      <p className="text-fg-primary font-semibold">{t("teams.noChannelsTitle")}</p>
      <p className="text-[13px] text-fg-tertiary mt-1 max-w-md mx-auto">{t("teams.noChannelsBody")}</p>
      {onCreate && (
        <Button className="mt-4" variant="gold" onClick={onCreate}>
          <Icon name="plus" size={14} /><span className="ml-1">{t("teams.createFirst")}</span>
        </Button>
      )}
      {!canManage && <p className="text-[12px] text-fg-tertiary mt-3">{t("teams.askAdmin")}</p>}
    </div>
  );
}
