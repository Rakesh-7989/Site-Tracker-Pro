// SiteTrack Pro â€” project Inspections tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listInspections, createInspection, setInspectionResult, deleteInspection, type Inspection, type InspectionResult } from "@/app/siteOpsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const RES = [{ value: "pending", label: "Pending" }, { value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "conditional", label: "Conditional" }];
const resTone = (r: InspectionResult): "neutral" | "success" | "danger" | "warning" => (r === "pass" ? "success" : r === "fail" ? "danger" : r === "conditional" ? "warning" : "neutral");

export function InspectionsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("inspection:create", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [type, setType] = useState("quality"); const [scope, setScope] = useState(""); const [sd, setSd] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listInspections(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!session) return; await run("add", c => createInspection(c, { projectId, type, scope: scope.trim() || undefined, scheduledDate: sd || null, inspectorId: session.user.id })); setScope(""); setSd(""); };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Inspections</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Type</span>
            <Select className="mt-1 w-auto" value={type} onChange={e => setType(e.target.value)} options={[{ value: "quality", label: "Quality" }, { value: "structural", label: "Structural" }, { value: "safety", label: "Safety" }, { value: "handover", label: "Handover" }]} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Scope</span><Input className="mt-1" placeholder="e.g. 3rd floor slab" value={scope} onChange={e => setScope(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Scheduled</span><Input className="mt-1" type="date" value={sd} onChange={e => setSd(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Schedule"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No inspections scheduled.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate capitalize">{r.type}{r.scope ? ` â€” ${r.scope}` : ""}</div>
                <div className="text-[11px] text-ink-400">{r.scheduledDate ? `Scheduled ${r.scheduledDate}` : "Unscheduled"}{r.inspectorName ? ` Â· ${r.inspectorName}` : ""}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.result} onChange={e => void run(`s-${r.id}`, c => setInspectionResult(c, r.id, e.target.value as InspectionResult))} options={RES} />
                  : <Badge tone={resTone(r.result)}>{r.result}</Badge>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteInspection(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
