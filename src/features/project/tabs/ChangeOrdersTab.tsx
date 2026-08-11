// SiteTrack Pro — project Change Orders tab (v3 port, Batch 4, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listChangeOrders, createChangeOrder, setCoStatus, deleteChangeOrder, type ChangeOrder, type CoStatus } from "@/app/designQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "submitted", label: "Submitted" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" }];

export function ChangeOrdersTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canCreate = useCan("changeorder:create", ctx);
  const canApprove = useCan("changeorder:approve", ctx);
  const [rows, setRows] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desc, setDesc] = useState(""); const [cost, setCost] = useState(""); const [days, setDays] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listChangeOrders(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!desc.trim() || !session) return;
    const no = `CO-${String(rows.length + 1).padStart(3, "0")}`;
    const c = cost.trim() ? Number(cost) : null;
    const d = days.trim() ? Number(days) : null;
    const tmpId = "tmp-" + Date.now();
    await run("add", cl => createChangeOrder(cl, { projectId, no, description: desc.trim(), costImpact: c ?? undefined, scheduleImpact: d ?? undefined, raisedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, no, description: desc.trim(), costImpact: Number.isFinite(c) ? c : null, scheduleImpact: Number.isFinite(d) ? d : null, reason: null, status: "submitted" as CoStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setDesc(""); setCost(""); setDays("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Change orders</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canCreate && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Description</span><Input className="mt-1" placeholder="e.g. Add basement parking" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Cost ₹ Â±</span><Input fit className="mt-1 w-28" type="number" value={cost} onChange={e => setCost(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Days Â±</span><Input fit className="mt-1 w-20" type="number" value={days} onChange={e => setDays(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !desc.trim()}>{busy === "add" ? <Spinner size={14} /> : "Raise"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No change orders.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.no} · {r.description}</div>
                <div className="text-[11px] text-fg-tertiary">{[r.costImpact != null && `${r.costImpact >= 0 ? "+" : ""}${fmtRupees(r.costImpact)}`, r.scheduleImpact != null && `${r.scheduleImpact >= 0 ? "+" : ""}${r.scheduleImpact}d`].filter(Boolean).join(" · ") || "no impact set"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canApprove ? <Select fit className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as CoStatus; void run(`s-${r.id}`, c => setCoStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                  : <span className="text-xs text-fg-secondary">{r.status}</span>}
                {canCreate && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteChangeOrder(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
