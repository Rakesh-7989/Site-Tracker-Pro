import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listPOs, createPO, setPOStatus, deletePO, fmtRupees, type PurchaseOrder, type POStatus } from "@/app/financeQueries";

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" }];

export function POsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canCreate = useCan("po:create", ctx);
  const canApprove = useCan("po:approve", ctx);
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poNo, setPoNo] = useState(""); const [items, setItems] = useState(""); const [amount, setAmount] = useState(""); const [dd, setDd] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPOs(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const amt = Number(amount);
    if (!poNo.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createPO(c, { projectId, poNo: poNo.trim(), items: items.trim() || undefined, amount: amt, deliveryDate: dd || null }), {
      apply: () => setRows(prev => [{ id: tmpId, poNo: poNo.trim(), items: items.trim() || null, amount: amt, deliveryDate: dd || null, status: "pending" as POStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setPoNo(""); setItems(""); setAmount(""); setDd("");
  };

  const columns: Column<PurchaseOrder>[] = [
    {
      key: "detail", header: "PO", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{r.poNo} · {fmtRupees(r.amount)}</div>
          <div className="text-[11px] text-fg-tertiary truncate">{[r.items, r.deliveryDate && `due ${r.deliveryDate}`].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      ),
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: r => canApprove ? (
        <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as POStatus; void run(`s-${r.id}`, c => setPOStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
      ) : <span className="text-xs text-fg-secondary">{r.status}</span>,
    },
    ...(canCreate ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: PurchaseOrder) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deletePO(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <Icon name="trash" size={14} className="text-error" />
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Purchase orders</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canCreate && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">PO No</span><Input className="mt-1 w-28" placeholder="PO-001" value={poNo} onChange={e => setPoNo(e.target.value)} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Items</span><Input className="mt-1" placeholder="e.g. 100 bags cement" value={items} onChange={e => setItems(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Amount ₹</span><Input className="mt-1 w-28" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Delivery</span><Input className="mt-1" type="date" value={dd} onChange={e => setDd(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !poNo.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Create"}</Button>
        </Card>
      )}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No purchase orders." />
    </div>
  );
}
