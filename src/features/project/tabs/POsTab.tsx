// SiteTrack Pro â€” project Purchase Orders tab (v3 port, Batch 3, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listPOs, createPO, setPOStatus, deletePO, fmtRupees, type PurchaseOrder, type POStatus } from "@/app/financeQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const STT = [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" }];

export function POsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canCreate = useCan("po:create", ctx);
  const canApprove = useCan("po:approve", ctx);
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [poNo, setPoNo] = useState(""); const [items, setItems] = useState(""); const [amount, setAmount] = useState(""); const [dd, setDd] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPOs(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { const amt = Number(amount); if (!poNo.trim() || !Number.isFinite(amt) || amt <= 0) return; await run("add", c => createPO(c, { projectId, poNo: poNo.trim(), items: items.trim() || undefined, amount: amt, deliveryDate: dd || null })); setPoNo(""); setItems(""); setAmount(""); setDd(""); };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Purchase orders</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canCreate && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">PO No</span><Input className="mt-1 w-28" placeholder="PO-001" value={poNo} onChange={e => setPoNo(e.target.value)} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Items</span><Input className="mt-1" placeholder="e.g. 100 bags cement" value={items} onChange={e => setItems(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Amount â‚¹</span><Input className="mt-1 w-28" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Delivery</span><Input className="mt-1" type="date" value={dd} onChange={e => setDd(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !poNo.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Create"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No purchase orders.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate">{r.poNo} Â· {fmtRupees(r.amount)}</div>
                <div className="text-[11px] text-ink-400 truncate">{[r.items, r.deliveryDate && `due ${r.deliveryDate}`].filter(Boolean).join(" Â· ") || "â€”"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canApprove ? <Select className="w-auto text-xs" value={r.status} onChange={e => void run(`s-${r.id}`, c => setPOStatus(c, r.id, e.target.value as POStatus))} options={STT} />
                  : <span className="text-xs text-ink-500">{r.status}</span>}
                {canCreate && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deletePO(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
