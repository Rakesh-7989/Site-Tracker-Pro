// SiteTrack Pro — project Safety tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listSafety, createSafety, setSafetyStatus, deleteSafety, type SafetyIncident, type SafetySeverity, type SafetyStatus } from "@/app/siteOpsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const SEV = [{ value: "near_miss", label: "Near miss" }, { value: "first_aid", label: "First aid" }, { value: "minor", label: "Minor" }, { value: "major", label: "Major" }, { value: "fatal", label: "Fatal" }];
const STT = [{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "escalated", label: "Escalated" }];
const sevTone = (s: SafetySeverity): "danger" | "warning" | "neutral" => (s === "fatal" || s === "major" ? "danger" : s === "minor" || s === "first_aid" ? "warning" : "neutral");

export function SafetyTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("safety:report", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<SafetyIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desc, setDesc] = useState(""); const [sev, setSev] = useState<SafetySeverity>("near_miss"); const [cat, setCat] = useState(""); const [loc, setLoc] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listSafety(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!desc.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createSafety(c, { projectId, description: desc.trim(), severity: sev, category: cat.trim() || undefined, location: loc.trim() || undefined, reportedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, description: desc.trim(), severity: sev, category: cat.trim() || undefined, location: loc.trim() || undefined, status: "open", incidentDate: new Date().toISOString().slice(0, 10) } as SafetyIncident, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setDesc(""); setCat(""); setLoc("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Safety incidents</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 space-y-2">
          <Input placeholder="What happened?" value={desc} onChange={e => setDesc(e.target.value)} />
          <div className="flex gap-2 flex-wrap items-center">
            <Select className="w-auto" value={sev} onChange={e => setSev(e.target.value as SafetySeverity)} options={SEV} />
            <Input className="w-32" placeholder="Category" value={cat} onChange={e => setCat(e.target.value)} />
            <Input className="w-32" placeholder="Location" value={loc} onChange={e => setLoc(e.target.value)} />
            <Button className="ml-auto" onClick={() => void add()} disabled={busy === "add" || !desc.trim()}>{busy === "add" ? <Spinner size={14} /> : "Report"}</Button>
          </div>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No incidents reported. ??</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="text-sm text-fg-primary flex items-center gap-2"><Badge tone={sevTone(r.severity)}>{r.severity.replace("_", " ")}</Badge>{r.description}</div>
                <div className="text-[11px] text-fg-tertiary mt-0.5">{[r.incidentDate, r.category, r.location].filter(Boolean).join(" · ")}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as SafetyStatus; void run(`s-${r.id}`, c => setSafetyStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                  : <span className="text-xs text-fg-secondary">{r.status}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteSafety(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
