// SiteTrack Pro — project Punch list tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listPunch, createPunch, setPunchStatus, deletePunch, type PunchItem, type PunchSeverity, type PunchStatus } from "@/app/queries/siteOpsQueries";

 
import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";
const SEV = [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" }];
const STT = [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "resolved", label: "Resolved" }, { value: "verified", label: "Verified" }, { value: "wont_fix", label: "Won't fix" }];
const sevTone = (s: PunchSeverity): "danger" | "warning" | "neutral" => (s === "critical" || s === "high" ? "danger" : s === "medium" ? "warning" : "neutral");

export function PunchTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("punchlist:add", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loc, setLoc] = useState(""); const [defect, setDefect] = useState(""); const [trade, setTrade] = useState(""); const [sev, setSev] = useState<PunchSeverity>("medium");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPunch(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!loc.trim() || !defect.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createPunch(c, { projectId, location: loc.trim(), defect: defect.trim(), trade: trade.trim() || undefined, severity: sev, reportedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, location: loc.trim(), defect: defect.trim(), trade: trade.trim() || null, severity: sev, assignedTo: null, status: "open" as PunchStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setLoc(""); setDefect(""); setTrade("");
  };

  const open = rows.filter(r => r.status === "open" || r.status === "in_progress").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold text-fg-primary">Punch list</h2>{rows.length > 0 && <span className="text-sm text-fg-secondary">{open} open</span>}</div>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Location</span><Input fit className="mt-1 w-32" placeholder="Unit 4B" value={loc} onChange={e => setLoc(e.target.value)} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Defect</span><Input className="mt-1" placeholder="e.g. Paint chipped" value={defect} onChange={e => setDefect(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Trade</span><Input fit className="mt-1 w-28" placeholder="finishing" value={trade} onChange={e => setTrade(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Severity</span><Select fit className="mt-1 w-auto" value={sev} onChange={e => setSev(e.target.value as PunchSeverity)} options={SEV} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !loc.trim() || !defect.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No punch items.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className={`p-3 flex items-center justify-between gap-3 ${r.status === "resolved" || r.status === "verified" ? "opacity-60" : ""}`}>
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate flex items-center gap-2"><Badge tone={sevTone(r.severity)}>{r.severity}</Badge>{r.location} — {r.defect}</div>
                <div className="text-[11px] text-fg-tertiary">{r.trade ?? "—"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select fit className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as PunchStatus; void run(`s-${r.id}`, c => setPunchStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                  : <span className="text-xs text-fg-secondary">{r.status.replace("_", " ")}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deletePunch(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
