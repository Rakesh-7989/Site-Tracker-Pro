// SiteTrack Pro â€” project Punch list tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listPunch, createPunch, setPunchStatus, deletePunch, type PunchItem, type PunchSeverity, type PunchStatus } from "@/app/siteOpsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [loc, setLoc] = useState(""); const [defect, setDefect] = useState(""); const [trade, setTrade] = useState(""); const [sev, setSev] = useState<PunchSeverity>("medium");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPunch(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!loc.trim() || !defect.trim() || !session) return; await run("add", c => createPunch(c, { projectId, location: loc.trim(), defect: defect.trim(), trade: trade.trim() || undefined, severity: sev, reportedBy: session.user.id })); setLoc(""); setDefect(""); setTrade(""); };

  const open = rows.filter(r => r.status === "open" || r.status === "in_progress").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-900">Punch list</h2>{rows.length > 0 && <span className="text-sm text-ink-500">{open} open</span>}</div>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Location</span><Input className="mt-1 w-32" placeholder="Unit 4B" value={loc} onChange={e => setLoc(e.target.value)} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Defect</span><Input className="mt-1" placeholder="e.g. Paint chipped" value={defect} onChange={e => setDefect(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Trade</span><Input className="mt-1 w-28" placeholder="finishing" value={trade} onChange={e => setTrade(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Severity</span><Select className="mt-1 w-auto" value={sev} onChange={e => setSev(e.target.value as PunchSeverity)} options={SEV} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !loc.trim() || !defect.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No punch items.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className={`p-3 flex items-center justify-between gap-3 ${r.status === "resolved" || r.status === "verified" ? "opacity-60" : ""}`}>
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate flex items-center gap-2"><Badge tone={sevTone(r.severity)}>{r.severity}</Badge>{r.location} â€” {r.defect}</div>
                <div className="text-[11px] text-ink-400">{r.trade ?? "â€”"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => void run(`s-${r.id}`, c => setPunchStatus(c, r.id, e.target.value as PunchStatus))} options={STT} />
                  : <span className="text-xs text-ink-500">{r.status.replace("_", " ")}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deletePunch(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
