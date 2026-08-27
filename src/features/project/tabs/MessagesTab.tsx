// SiteTrack Pro — project "Messages" tab: embeds the unified ChatStream on
// this project's lazy main stream (migration 232). Replaces the legacy
// project-only chat; the same stream is reachable from the /chat hub rail.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useOrgSwitcher } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { Button, Alert, Icon } from "@/components/ui/atoms";
import {
  ensureProjectStream,
  type ChatChannel } from "@/app/queries/chatQueries";
import { listOrgMembers } from "@/app/queries/orgMemberQueries";
import type { MentionCandidate } from "@/app/queries/chatQueries";
import { ChatStream } from "@/features/shared/ChatStream";
import { getClient } from "@/lib/supabase/supabase";

export function MessagesTab({ projectId }: { projectId: string }): JSX.Element {
  const t = useT();
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const orgId = activeOrg?.orgId ?? "";

  const [channelId, setChannelId] = useState<string | null>(null);
  const [members, setMembers] = useState<MentionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const ensure = useCallback(async () => {
    if (!orgId || !session) return;
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await ensureProjectStream(client, projectId);
    if (res.ok) setChannelId(res.data.id);
    else setError(res.error);
    setLoading(false);
  }, [orgId, projectId, session]);

  useEffect(() => { void ensure(); }, [ensure, reloadKey]);

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

  const channel: ChatChannel | null = channelId ? {
    id: channelId,
    name: "",           // header shows the project context instead
    description: null,
    isArchived: false,
    kind: "channel",
    scope: "project",
    projectId,
    visibility: "open",
    createdAt: "" } : null;

  if (loading) return (
    <div role="status" aria-label="Loading" aria-busy="true" className="space-y-4 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card rounded-2xl border border-default p-4 space-y-2">
            <div className="h-6 bg-elevated rounded animate-pulse w-3/4" />
            <div className="h-4 bg-elevated rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
      <div className="h-40 bg-elevated rounded-2xl animate-pulse" />
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-elevated rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold text-fg-primary flex items-center gap-2">
          <Icon name="msgcircle" size={17} className="text-accent" />{t("projTab.messages")}
        </h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-tint text-accent font-semibold">
          {t("chat.projectStreamSub")}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto"
          onClick={() => setReloadKey(k => k + 1)} title="Refresh">
          <Icon name="refresh" size={14} />
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {channel
        ? <ChatStream channel={channel} mentionCandidates={members} />
        : null}
    </div>
  );
}
