// SiteTrack Pro — Chat hub at /chat (Cliq-style unified surface).
// Left rail sections:
//   PROJECTS  — every active membership; clicking lazily ensures that
//               project's main stream and opens it.
//   CHANNELS  — org-wide staff channels (+ archived, managers see them).
//   DIRECT MESSAGES — 1:1 conversations via chat_open_dm.
// The stream itself is the shared <ChatStream> (also embedded in the
// project DetailView "Messages" tab).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { Card, Button, Spinner, Alert, Icon, Avatar } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import {
  listChannels, createChannel, setChannelArchived, deleteChannel,
  ensureProjectStream, openDm,
  listDmPartnerNames, fetchUnreadCounts,
  type ChatChannel,
} from "@/app/chatQueries";
import type { MentionCandidate } from "@/app/chatQueries";
import { ChatStream } from "@/features/shared/ChatStream";
import { listOrgMembers } from "@/app/orgMemberQueries";
import { getClient } from "@/lib/supabase";
import { cn } from "@/lib/cn";

export function TeamChatView(): JSX.Element {
  const t = useT();
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("chat:manage");
  const [params] = useSearchParams();

  const orgId = activeOrg?.orgId ?? "";
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [dmNames, setDmNames] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<MentionCandidate[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState(false);
  // DM picker
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [dmQuery, setDmQuery] = useState("");
  const [openingDm, setOpeningDm] = useState(false);
  // channel_id -> unread count (P2 badges)
  const [unread, setUnread] = useState<Record<string, number>>({});

  const refreshUnread = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const res = await fetchUnreadCounts(client);
    if (res.ok) setUnread(res.data);
  }, []);

  useEffect(() => { void refreshUnread(); }, [refreshUnread]);
  useEffect(() => {
    const timer = setInterval(() => { void refreshUnread(); }, 20000);
    return () => clearInterval(timer);
  }, [refreshUnread]);
  // Selecting a channel clears its badge locally.
  useEffect(() => { setUnread(prev => { if (!prev[activeId]) return prev; const n = { ...prev }; delete n[activeId]; return n; }); }, [activeId]);

  const unreadFor = (projectIdOrChannelId: string): number | null => {
    const n = unread[projectIdOrChannelId];
    return n && n > 0 ? Math.min(n, 99) : null;
  };
  const unreadForProject = (projectId: string): number | null => {
    const ch = channels.find(c => c.scope === "project" && c.projectId === projectId && !c.isArchived);
    return ch ? unreadFor(ch.id) : null;
  };

  const memberships = useMemo(() => session?.projectMemberships ?? [], [session]);

  const reloadChannels = useCallback(async () => {
    if (!orgId || !session) { setLoading(false); return; }
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listChannels(client, orgId);
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setChannels(res.data);
    const dmIds = res.data.filter(c => c.kind === "dm").map(c => c.id);
    const names = await listDmPartnerNames(client, dmIds, session.user.id);
    if (names.ok) setDmNames(names.data);
    setLoading(false);
  }, [orgId, session]);

  useEffect(() => { void reloadChannels(); }, [reloadChannels]);

  // Mention candidates = active org members.
  useEffect(() => {
    if (!orgId || !session) return;
    let cancelled = false;
    void (async () => {
      const client = await getClient();
      if (!client || cancelled) return;
      const res = await listOrgMembers(client, orgId);
      if (!cancelled && res.ok) {
        setMembers(res.data.filter(m => m.active).map(m => ({ profileId: m.profileId, name: m.name })));
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, session]);

  // Deep link ?c=<channelId> selects directly.
  useEffect(() => {
    const c = params.get("c");
    if (c) setActiveId(c);
  }, [params]);

  // Default selection once loaded (deep link wins).
  useEffect(() => {
    if (activeId && channels.some(c => c.id === activeId)) return;
    if (activeId && !loading && !channels.some(c => c.id === activeId)) setActiveId("");
    if (!activeId && channels.length > 0) {
      const firstOrg = channels.find(c => c.kind === "channel" && c.scope === "org" && !c.isArchived)
        ?? channels.find(c => !c.isArchived);
      if (firstOrg) setActiveId(firstOrg.id);
    }
  }, [channels, activeId, loading]);

  // ── Project streams: lazy ensure on click ────────────────────────────────
  const openProjectStream = async (projectId: string) => {
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await ensureProjectStream(client, projectId);
    if (!res.ok) { setError(res.error); return; }
    await reloadChannels();
    setActiveId(res.data.id);
  };

  const openDmWith = async (otherId: string) => {
    if (!orgId) return;
    setOpeningDm(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setOpeningDm(false); return; }
    const res = await openDm(client, orgId, otherId);
    if (res.ok) {
      setShowDmPicker(false); setDmQuery("");
      await reloadChannels();
      setActiveId(res.data.id);
    } else setError(res.error);
    setOpeningDm(false);
  };

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

  const archiveChannel = async (c: ChatChannel) => {
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await setChannelArchived(client, c.id, !c.isArchived);
    if (res.ok) await reloadChannels(); else setError(res.error);
  };

  const removeChannel = async (c: ChatChannel) => {
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await deleteChannel(client, c.id);
    if (res.ok) {
      if (activeId === c.id) setActiveId("");
      await reloadChannels();
    } else setError(res.error);
  };

  const active = channels.find(c => c.id === activeId) ?? null;
  const orgChannels = channels.filter(c => c.kind === "channel" && c.scope === "org" && !c.isArchived);
  const archivedChannels = channels.filter(c => c.kind === "channel" && c.isArchived);
  const dms = channels.filter(c => c.kind === "dm");
  const mentionCandidates = useMemo(
    () => members.filter(m => m.profileId !== session?.user.id),
    [members, session],
  );
  const dmCandidates = useMemo(() => {
    const q = dmQuery.toLowerCase();
    return members
      .filter(m => m.profileId !== session?.user.id)
      .filter(m => q === "" || m.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [members, dmQuery, session]);
  const partnerName = (c: ChatChannel): string => dmNames[c.id] ?? t("teams.dmUnnamed");

  const railBtn = (sel: boolean) => cn(
    "w-full text-left rounded-lg px-2.5 py-1.5 text-sm flex items-center gap-1.5 group min-w-0",
    sel ? "bg-accent-tint text-accent font-semibold" : "hover:bg-bg-secondary text-fg-secondary",
  );

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-fg-primary flex items-center gap-2">
            <Icon name="msgcircle" size={22} className="text-accent" />{t("teams.title")}
          </h1>
          <p className="text-fg-tertiary text-sm mt-1">{t("chat.subtitle")}</p>
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

      <div className="grid md:grid-cols-[230px_1fr] gap-4 items-start">
        {/* ── Left rail: Projects / Channels / DMs ── */}
        <Card padding="sm" className="md:sticky md:top-20">
          {/* PROJECTS */}
          <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-tertiary px-1 pb-1">{t("chat.sectionProjects")}</div>
          <div className="space-y-0.5">
            {memberships.length === 0 && (
              <div className="px-2.5 py-1 text-xs text-fg-tertiary">{t("chat.noProjects")}</div>
            )}
            {memberships.map(pm => {
              const ch = channels.find(c => c.scope === "project" && c.projectId === pm.projectId && !c.isArchived);
              const sel = !!ch && ch.id === activeId;
              return (
                <button key={pm.projectId} type="button"
                  onClick={() => void openProjectStream(pm.projectId)}
                  className={railBtn(sel)}
                  title={pm.projectName}
                >
                  <Icon name="hardhat" size={13} className="flex-shrink-0" />
                  <span className="truncate">{pm.projectName}</span>
                  {unreadForProject(pm.projectId) != null && (
                    <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-error text-white text-[10px] font-bold">
                      {unreadForProject(pm.projectId)}
                    </span>
                  )}
                  {!ch && unreadForProject(pm.projectId) == null && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-fg-tertiary/50 flex-shrink-0" title={t("chat.firstOpenCreates")} />}
                </button>
              );
            })}
          </div>

          {/* CHANNELS */}
          {(orgChannels.length > 0 || canManage) && (
            <>
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-tertiary px-1 pt-3 pb-1">{t("chat.sectionChannels")}</div>
              <div className="space-y-0.5">
                {orgChannels.length === 0 && <div className="px-2.5 py-1 text-xs text-fg-tertiary">{t("chat.noChannels")}</div>}
                {orgChannels.map(c => (
                  <div key={c.id} className="relative">
                    <button type="button" onClick={() => setActiveId(c.id)}
                      className={cn(railBtn(c.id === activeId), "justify-between pr-6")}>
                      <span className="truncate"># {c.name}</span>
                      {unreadFor(c.id) != null && (
                        <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-error text-white text-[10px] font-bold">
                          {unreadFor(c.id)}
                        </span>
                      )}
                    </button>
                    {canManage && c.id === activeId && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-70">
                        <button type="button" aria-label={`${t("teams.archive")} ${c.name}`} title={t("teams.archive")} onClick={() => void archiveChannel(c)}>
                          <Icon name="lock" size={12} />
                        </button>
                        <button type="button" aria-label={`${t("teams.delete")} ${c.name}`} title={t("teams.delete")} onClick={() => void removeChannel(c)}>
                          <Icon name="trash" size={12} className="text-error" />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {canManage && archivedChannels.length > 0 && (
            <div className="mt-2 pt-2 border-t border-default space-y-0.5">
              {archivedChannels.map(c => (
                <div key={c.id} className="px-2.5 py-1 text-xs text-fg-tertiary truncate line-through opacity-60">#{c.name}</div>
              ))}
            </div>
          )}

          {/* DIRECT MESSAGES */}
          <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-tertiary px-1 pt-3 pb-1 flex items-center justify-between">
            <span>{t("chat.sectionDms")}</span>
            <button type="button" onClick={() => setShowDmPicker(true)}
              className="text-accent hover:text-accent/80" aria-label={t("chat.newDm")} title={t("chat.newDm")}>
              <Icon name="plus" size={13} />
            </button>
          </div>
          <div className="space-y-0.5">
            {dms.length === 0 && <div className="px-2.5 py-1 text-xs text-fg-tertiary">{t("chat.noDms")}</div>}
            {dms.map(c => (
              <button key={c.id} type="button" onClick={() => setActiveId(c.id)} className={cn(railBtn(c.id === activeId), "justify-between")}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Avatar initials={(partnerName(c)[0] ?? "?").toUpperCase()} size="sm" />
                  <span className="truncate">{partnerName(c)}</span>
                </span>
                {unreadFor(c.id) != null && (
                  <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-error text-white text-[10px] font-bold">
                    {unreadFor(c.id)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* ── Main stream ── */}
        <Card className="overflow-hidden min-w-0">
          {active ? (
            <>
              <div className="p-4 border-b border-default flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0 flex items-center gap-2">
                  {active.scope === "project"
                    ? <Icon name="hardhat" size={15} className="text-accent flex-shrink-0" />
                    : active.kind === "dm"
                      ? <Avatar initials={(partnerName(active)[0] ?? "?").toUpperCase()} size="sm" />
                      : <span className="font-bold text-fg-primary">#</span>}
                  <div className="min-w-0">
                    <div className="font-bold text-fg-primary truncate">
                      {active.kind === "dm" ? partnerName(active) : active.name}
                    </div>
                    <div className="text-xs text-fg-tertiary truncate">
                      {active.description
                        || (active.scope === "project" ? t("chat.projectStreamSub") : `${dms.length ? "" : ""}${t("chat.channelSub")}`)}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void reloadChannels()} title="Refresh">
                  <Icon name="refresh" size={14} />
                </Button>
              </div>
              <ChatStreamBody
                key={active.id}
                channel={active}
                mentionCandidates={mentionCandidates}
                highlightMessageId={params.get("m")}
              />
            </>
          ) : (
            <EmptySelection />
          )}
        </Card>
      </div>

      {/* DM picker modal */}
      <Modal
        open={showDmPicker}
        onClose={() => setShowDmPicker(false)}
        size="sm"
        title={t("chat.newDmTitle")}
        ariaLabel="Pick a person to message"
      >
        <Input
          className="mb-2"
          placeholder={t("chat.searchPeople")}
          value={dmQuery}
          onChange={e => setDmQuery(e.target.value)}
        />
        <div className="max-h-[320px] overflow-y-auto space-y-0.5">
          {dmCandidates.length === 0 && <div className="text-sm text-fg-tertiary py-4 text-center">{t("chat.noPeople")}</div>}
          {dmCandidates.map(m => (
            <button key={m.profileId} type="button"
              onClick={() => void openDmWith(m.profileId)}
              disabled={openingDm}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-bg-secondary flex items-center gap-2 text-sm"
            >
              <Avatar initials={(m.name[0] ?? "?").toUpperCase()} size="sm" />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function EmptySelection(): JSX.Element {
  const t = useT();
  return (
    <div className="grid place-items-center py-24 text-center px-6">
      <Icon name="msgcircle" size={44} className="mx-auto mb-3 text-fg-tertiary" />
      <p className="text-fg-secondary font-semibold">{t("chat.pickConversation")}</p>
      <p className="text-[13px] text-fg-tertiary mt-1 max-w-sm">{t("chat.pickConversationSub")}</p>
    </div>
  );
}

// Thin wrapper kept local: ChatStream is the shared surface component.
function ChatStreamBody(props: Parameters<typeof ChatStream>[0]): JSX.Element {
  return <ChatStream {...props} />;
}
