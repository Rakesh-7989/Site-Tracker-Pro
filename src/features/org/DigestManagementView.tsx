// SiteTrack Pro — Digest Management (/digest).
// Manage promoter WhatsApp digest subscriptions. Gated by digest:subscribe.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
import { listDigestSubscriptions, createDigestSubscription, updateDigestSubscription, listDigestDispatches, type DigestSubscription, type DigestLang, type DigestStatus } from "@/app/digestQueries";

const LANG_OPTS = [{ value: "en", label: "English" }, { value: "te", label: "తెలుగు" }, { value: "hi", label: "हिन्दी" }];
const statusTone = (s: DigestStatus): "success" | "warning" | "danger" => (s === "active" ? "success" : s === "paused" ? "warning" : "danger");

export function DigestManagementView(): JSX.Element {
  const canView = useCan("digest:subscribe");
  const canEdit = useCan("digest:subscribe");
  const { activeOrg } = useOrgSwitcher();
  const [subs, setSubs] = useState<DigestSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [lang, setLang] = useState<DigestLang>("en");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [dispLoading, setDispLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!activeOrg?.orgId) { setSubs([]); setLoading(false); return; }
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listDigestSubscriptions(client, activeOrg.orgId);
    if (res.ok) setSubs(res.data); else setError(res.error);
    setLoading(false);
  }, [activeOrg?.orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!phone.trim() || !activeOrg?.orgId) return;
    if (!/^\+\d{10,15}$/.test(phone.trim())) { setError("Phone must be in E.164 format (+919876543210)"); return; }
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createDigestSubscription(c, { orgId: activeOrg.orgId, promoterPhoneE164: phone.trim(), promoterName: name.trim() || undefined, language: lang }), {
      apply: () => setSubs(prev => [{ id: tmpId, orgId: activeOrg.orgId, projectId: null, promoterPhoneE164: phone.trim(), promoterName: name.trim() || null, language: lang, timezone: "Asia/Kolkata", hourLocal: 7, status: "active", projectName: null }, ...prev]),
      rollback: () => setSubs(prev => prev.filter(x => x.id !== tmpId)),
    });
    setPhone(""); setName("");
  };

  const toggleExpanded = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id); setDispLoading(true);
    const client = await getClient();
    if (client) {
      const res = await listDigestDispatches(client, id);
      if (res.ok) setDispatches(res.data); else setDispatches([]);
    }
    setDispLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink-900">Digest Management</h1>
      {!canView && <Alert variant="danger">You do not have permission to manage digests.</Alert>}
      {canView && (
        <>
          {error && <Alert variant="danger">{error}</Alert>}
          {canEdit && (
            <Card className="p-3 flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Phone (E.164)</span><Input className="mt-1" placeholder="+919876543210" value={phone} onChange={e => setPhone(e.target.value)} /></div>
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Name</span><Input className="mt-1 w-40" placeholder="Ravi" value={name} onChange={e => setName(e.target.value)} /></div>
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Language</span><Select className="mt-1 w-auto" value={lang} onChange={e => setLang(e.target.value as DigestLang)} options={LANG_OPTS} /></div>
              <Button onClick={() => void add()} disabled={busy === "add" || !phone.trim()}>{busy === "add" ? <Spinner size={14} /> : "Subscribe"}</Button>
            </Card>
          )}
          {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
            : subs.length === 0 ? <div className="text-sm text-ink-500">No digest subscriptions.</div>
            : <div className="space-y-2">{subs.map(s => (
                <div key={s.id}>
                  <Card className="p-3"><div className="flex items-center justify-between gap-3 cursor-pointer" onClick={() => void toggleExpanded(s.id)}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink-800 truncate flex items-center gap-2"><Badge tone={statusTone(s.status)}>{s.status}</Badge>{s.promoterName ?? s.promoterPhoneE164}</div>
                      <div className="text-[11px] text-ink-400">{s.promoterPhoneE164} &middot; {s.language === "te" ? "తెలుగు" : s.language === "hi" ? "हिन्दी" : "English"} &middot; {s.hourLocal}:00 {s.timezone}</div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {s.status === "active" && <Button size="sm" variant="ghost" onClick={() => void run(`pause-${s.id}`, c => updateDigestSubscription(c, s.id, { status: "paused" }), { apply: () => setSubs(prev => prev.map(x => x.id === s.id ? { ...x, status: "paused" as DigestStatus } : x)), rollback: () => setSubs(prev => prev.map(x => x.id === s.id ? { ...x, status: s.status } : x)) })}>Pause</Button>}
                        {s.status === "paused" && <Button size="sm" variant="ghost" onClick={() => void run(`resume-${s.id}`, c => updateDigestSubscription(c, s.id, { status: "active" }), { apply: () => setSubs(prev => prev.map(x => x.id === s.id ? { ...x, status: "active" as DigestStatus } : x)), rollback: () => setSubs(prev => prev.map(x => x.id === s.id ? { ...x, status: s.status } : x)) })}>Resume</Button>}
                        <Button size="sm" variant="ghost" onClick={() => void run(`cancel-${s.id}`, c => updateDigestSubscription(c, s.id, { status: "cancelled" }), { apply: () => setSubs(prev => prev.map(x => x.id === s.id ? { ...x, status: "cancelled" as DigestStatus } : x)), rollback: () => setSubs(prev => prev.map(x => x.id === s.id ? { ...x, status: s.status } : x)) })}><span className="text-rose-500">Cancel</span></Button>
                      </div>
                    )}
                    </div>
                  </Card>
                  {expandedId === s.id && (
                    <Card className="p-3 mt-1 border-t border-border">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">Dispatch History</h4>
                      {dispLoading ? <Spinner size={14} />
                        : dispatches.length === 0 ? <div className="text-xs text-ink-400">No dispatches yet.</div>
                        : <div className="space-y-1">{dispatches.map(d => (
                            <div key={d.id} className="flex items-center justify-between text-xs text-ink-600">
                              <span>{d.sentForDate}</span>
                              <Badge tone={d.outcome === "sent" ? "success" : d.outcome === "failed" ? "danger" : "neutral"}>{d.outcome}</Badge>
                            </div>
                          ))}</div>
                      }
                    </Card>
                  )}
                </div>
              ))}
            </div>
          }
        </>
      )}
    </div>
  );
}