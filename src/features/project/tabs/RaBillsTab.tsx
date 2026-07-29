// SiteTrack Pro — project RA Bills tab (v3 port, Batch 3, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listRaBills, createRaBill, setRaBillStatus, deleteRaBill, raNetPayable, fmtRupees, type RaBill, type RaBillStatus } from "@/app/financeQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "submitted", label: "Submitted" }, { value: "approved", label: "Approved" }, { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" }];

export function RaBillsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canCreate = useCan("rabill:create", ctx);
  const canApprove = useCan("rabill:approve", ctx);
  const [rows, setRows] = useState<RaBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [no, setNo] = useState(""); const [sub, setSub] = useState(""); const [scope, setScope] = useState(""); const [amount, setAmount] = useState(""); const [ret, setRet] = useState("5");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listRaBills(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const amt = Number(amount);
    if (!no.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createRaBill(c, { projectId, no: no.trim(), subcontractor: sub.trim() || undefined, scope: scope.trim() || undefined, billAmount: amt, retentionPct: Number(ret) || 5 }), {
      apply: () => setRows(prev => [{ id: tmpId, no: no.trim(), subcontractor: sub.trim() || null, scope: scope.trim() || null, billAmount: amt, retentionPct: Number(ret) || 5, paidAmount: 0, billDate: null, status: "submitted" as RaBillStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setNo(""); setSub(""); setScope(""); setAmount("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">RA Bills</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canCreate && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Bill No</span><Input className="mt-1 w-24" placeholder="RA-1" value={no} onChange={e => setNo(e.target.value)} /></div>
          <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Subcontractor</span><Input className="mt-1" value={sub} onChange={e => setSub(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Amount ?</span><Input className="mt-1 w-28" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Retention %</span><Input className="mt-1 w-20" type="number" value={ret} onChange={e => setRet(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !no.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No RA bills.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.no} · {fmtRupees(r.billAmount)}</div>
                <div className="text-[11px] text-fg-tertiary truncate">{r.subcontractor ?? "—"} · net {fmtRupees(raNetPayable(r))} ({r.retentionPct}% ret)</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canApprove ? <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as RaBillStatus; void run(`s-${r.id}`, c => setRaBillStatus(c, r.id, v, v === "paid" ? raNetPayable(r) : undefined), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                  : <span className="text-xs text-fg-secondary">{r.status}</span>}
                {canCreate && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteRaBill(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
