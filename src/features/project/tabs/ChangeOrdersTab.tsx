// SiteTrack Pro — project Change Orders tab (v3 port, Batch 4, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listChangeOrders, createChangeOrder, setCoStatus, deleteChangeOrder, type ChangeOrder, type CoStatus } from "@/app/designQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
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
  const [busy, setBusy] = useState<string | null>(null);
  const [desc, setDesc] = useState(""); const [cost, setCost] = useState(""); const [days, setDays] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listChangeOrders(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!desc.trim() || !session) return; const no = `CO-${String(rows.length + 1).padStart(3, "0")}`; const c = cost.trim() ? Number(cost) : undefined; const d = days.trim() ? Number(days) : undefined; await run("add", cl => createChangeOrder(cl, { projectId, no, description: desc.trim(), costImpact: Number.isFinite(c) ? c : undefined, scheduleImpact: Number.isFinite(d) ? d : undefined, raisedBy: session.user.id })); setDesc(""); setCost(""); setDays(""); };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Change orders</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canCreate && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Description</span><Input className="mt-1" placeholder="e.g. Add basement parking" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Cost ₹ ±</span><Input className="mt-1 w-28" type="number" value={cost} onChange={e => setCost(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Days ±</span><Input className="mt-1 w-20" type="number" value={days} onChange={e => setDays(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !desc.trim()}>{busy === "add" ? <Spinner size={14} /> : "Raise"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No change orders.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate">{r.no} · {r.description}</div>
                <div className="text-[11px] text-ink-400">{[r.costImpact != null && `${r.costImpact >= 0 ? "+" : ""}${fmtRupees(r.costImpact)}`, r.scheduleImpact != null && `${r.scheduleImpact >= 0 ? "+" : ""}${r.scheduleImpact}d`].filter(Boolean).join(" · ") || "no impact set"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canApprove ? <Select className="w-auto text-xs" value={r.status} onChange={e => void run(`s-${r.id}`, c => setCoStatus(c, r.id, e.target.value as CoStatus))} options={STT} />
                  : <span className="text-xs text-ink-500">{r.status}</span>}
                {canCreate && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteChangeOrder(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
