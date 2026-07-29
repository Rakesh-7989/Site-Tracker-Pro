// SiteTrack Pro — project Estimate tab (v3 port, Batch 4, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listEstimates, createEstimate, setEstimateStatus, deleteEstimate, type Estimate, type EstimateStatus } from "@/app/designQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const NEXT: Record<EstimateStatus, EstimateStatus> = { draft: "submitted", submitted: "approved", approved: "superseded", superseded: "draft", rejected: "draft" };
const tone = (s: EstimateStatus): "neutral" | "info" | "success" | "danger" => (s === "approved" ? "success" : s === "submitted" ? "info" : s === "rejected" ? "danger" : "neutral");

export function EstimateTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("estimate:edit", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(""); const [total, setTotal] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listEstimates(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const amt = Number(total);
    if (!name.trim() || !Number.isFinite(amt) || amt <= 0 || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createEstimate(c, { projectId, name: name.trim(), totalAmount: amt, createdBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, name: name.trim(), totalAmount: amt, version: 1, status: "draft" as EstimateStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setName(""); setTotal("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Estimates</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Name</span><Input className="mt-1" placeholder="e.g. Client quote v1" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Total ?</span><Input className="mt-1 w-32" type="number" value={total} onChange={e => setTotal(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !name.trim() || !total}>{busy === "add" ? <Spinner size={14} /> : "Create"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No estimates.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.name} <span className="text-[11px] text-fg-tertiary font-normal">v{r.version}</span></div>
                <div className="text-[11px] text-fg-secondary">{fmtRupees(r.totalAmount)}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <button type="button" disabled={busy === `s-${r.id}`} onClick={() => { const ns = NEXT[r.status]; void run(`s-${r.id}`, c => setEstimateStatus(c, r.id, ns), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: ns } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }}><Badge tone={tone(r.status)}>{r.status}</Badge></button>
                  : <Badge tone={tone(r.status)}>{r.status}</Badge>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteEstimate(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
