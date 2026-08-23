// SiteTrack Pro — project "Messages" tab: embeds the unified ChatStream on
// this project's lazy main stream (migration 232). Replaces the legacy
// project-only chat; the same stream is reachable from the /chat hub rail.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useOrgSwitcher } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import {
  ensureProjectStream,
  type ChatChannel,
} from "@/app/chatQueries";
import { listOrgMembers } from "@/app/orgMemberQueries";
import type { MentionCandidate } from "@/app/chatQueries";
import { ChatStream } from "@/features/shared/ChatStream";
import { getClient } from "@/lib/supabase";

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
    createdAt: "",
  } : null;

  if (loading) return <div className="grid place-items-center py-12"><Spinner size={22} /></div>;

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
