// SiteTrack Pro — Org Notification Rules (/org/notifications). "Alert <channel>
// when <trigger>" rules. DB-wired (notification_rules table, migration 78).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { listRules, createRule, setRuleEnabled, deleteRule, NOTIF_CHANNELS, NOTIF_TRIGGERS, TRIGGER_LABEL, CHANNEL_LABEL, type NotifRule, type NotifChannel } from "@/app/orgConfigQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const TRIGGER_OPTS = NOTIF_TRIGGERS.map(t => ({ value: t.id, label: t.label }));
const CHANNEL_OPTS = NOTIF_CHANNELS.map(c => ({ value: c, label: CHANNEL_LABEL[c] }));

export function OrgNotificationsView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("org:notifications:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Notification rules require org admin." />;
  return <Inner orgId={activeOrg.orgId} createdBy={session.user.id} />;
}

function Inner({ orgId, createdBy }: { orgId: string; createdBy: string }): JSX.Element {
  const [rows, setRows] = useState<NotifRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<string>(NOTIF_TRIGGERS[0].id); const [channel, setChannel] = useState<NotifChannel>("in_app");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listRules(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createRule(c, { orgId, trigger, channel, createdBy }), {
      apply: () => setRows(prev => [{ id: tmpId, trigger, channel, createdBy, enabled: true }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Notification rules</h1>
      <p className="text-sm text-fg-secondary -mt-2">Send an alert on a chosen channel whenever an event happens in your org.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Card className="p-3 flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[180px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">When...</span><Select className="mt-1" value={trigger} onChange={e => setTrigger(e.target.value)} options={TRIGGER_OPTS} /></div>
        <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notify via</span><Select className="mt-1 w-32" value={channel} onChange={e => setChannel(e.target.value as NotifChannel)} options={CHANNEL_OPTS} /></div>
        <Button onClick={() => void add()} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Add rule"}</Button>
      </Card>
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No rules configured.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{TRIGGER_LABEL[r.trigger] ?? r.trigger}</div>
                <div className="text-[11px] text-fg-tertiary">via {CHANNEL_LABEL[r.channel]}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button type="button" disabled={busy === `t-${r.id}`} onClick={() => { const next = !r.enabled; void run(`t-${r.id}`, c => setRuleEnabled(c, r.id, next), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, enabled: next } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, enabled: r.enabled } : x)) }); }}>
                  <Badge tone={r.enabled ? "success" : "neutral"}>{r.enabled ? "On" : "Off"}</Badge>
                </button>
                <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteRule(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>
              </div>
            </Card>))}</div>}
    </div>
  );
}
