import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { ProgressBar } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listPOs, createPO, setPOStatus, deletePO, fmtRupees, type PurchaseOrder, type POStatus } from "@/app/financeQueries";
import { listVendors, type Vendor } from "@/app/vendorQueries";
import { listPoReceipts, addPoReceipt, deletePoReceipt, deliveryProgress, openAmount, receiptAmount, type PoReceipt } from "@/app/poReceiptQueries";

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" }];

export function POsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const orgId = activeOrg?.orgId;
  const ctx = { orgId, projectId };
  const canCreate = useCan("po:create", ctx);
  const canApprove = useCan("po:approve", ctx);
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poNo, setPoNo] = useState(""); const [items, setItems] = useState(""); const [amount, setAmount] = useState(""); const [dd, setDd] = useState(""); const [vendorId, setVendorId] = useState("");

  // Goods-receipt panel.
  const [openPoId, setOpenPoId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<PoReceipt[]>([]);
  const [rcvDate, setRcvDate] = useState(""); const [rcvQty, setRcvQty] = useState("1"); const [rcvPrice, setRcvPrice] = useState(""); const [rcvNotes, setRcvNotes] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPOs(client, projectId); if (res.ok) setRows(res.data); else setError(res.error);
    if (orgId) { const v = await listVendors(client, orgId); if (v.ok) setVendors(v.data); }
    setLoading(false);
  }, [projectId, orgId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  const loadReceipts = useCallback(async (poId: string) => {
    const client = await getClient(); if (!client) return;
    const res = await listPoReceipts(client, poId);
    if (res.ok) setReceipts(res.data); else setError(res.error);
  }, []);
  useEffect(() => {
    if (openPoId) void loadReceipts(openPoId); else setReceipts([]);
  }, [openPoId, loadReceipts]);

  const add = async () => {
    const amt = Number(amount);
    if (!poNo.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const tmpId = "tmp-" + Date.now();
    const v = vendorId ? vendors.find(x => x.id === vendorId) : undefined;
    await run("add", c => createPO(c, { projectId, poNo: poNo.trim(), items: items.trim() || undefined, amount: amt, deliveryDate: dd || null, vendorId: v?.id ?? null }), {
      apply: () => setRows(prev => [{ id: tmpId, poNo: poNo.trim(), items: items.trim() || null, amount: amt, deliveryDate: dd || null, status: "pending" as POStatus, vendorId: v?.id ?? null, vendorName: v?.name ?? null, quoteId: null, quoteItem: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setPoNo(""); setItems(""); setAmount(""); setDd(""); setVendorId("");
  };

  const addReceipt = async (po: PurchaseOrder) => {
    const qty = Number(rcvQty); const price = Number(rcvPrice);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return;
    const amount = receiptAmount(qty, price);
    const tmpId = "tmp-" + Date.now();
    await run(`r-${po.id}`, c => addPoReceipt(c, { poId: po.id, receivedDate: rcvDate || undefined, qty, unitPrice: price, notes: rcvNotes.trim() || null }), {
      apply: () => setReceipts(prev => [{ id: tmpId, poId: po.id, receivedDate: rcvDate || "", qty, unitPrice: price, amount, notes: rcvNotes.trim() || null, receivedByName: null, createdAt: "" }, ...prev]),
      rollback: () => setReceipts(prev => prev.filter(x => x.id !== tmpId)),
    });
    setRcvDate(""); setRcvQty("1"); setRcvPrice(""); setRcvNotes("");
  };

  const removeReceipt = async (r: PoReceipt) => {
    await run(`dr-${r.id}`, c => deletePoReceipt(c, r.id), {
      apply: () => setReceipts(prev => prev.filter(x => x.id !== r.id)),
      rollback: () => setReceipts(prev => [...prev, r]),
    });
  };

  const receiptPanel = (po: PurchaseOrder) => {
    const received = receipts.reduce((acc, r) => acc + r.amount, 0);
    const pct = deliveryProgress(po.amount, receipts);
    const open = openAmount(po.amount, receipts);
    return (
      <div className="mt-3 p-3 rounded-xl border border-default bg-elevated space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Goods receipts</div>
            <div className="text-sm font-semibold text-fg-primary">{fmtRupees(received)} received · {fmtRupees(open)} open</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ProgressBar value={pct} color={pct >= 100 ? "emerald" : "orange"} className="w-28" />
            <span className="text-[11px] font-semibold text-fg-secondary w-9">{pct}%</span>
          </div>
        </div>

        {receipts.length === 0 ? (
          <div className="text-sm text-fg-tertiary">No receipts recorded yet.</div>
        ) : (
          <div className="space-y-1.5">
            {receipts.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-card border border-default px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-fg-primary">{r.qty} × {fmtRupees(r.unitPrice)} = {fmtRupees(r.amount)}</div>
                  <div className="text-[11px] text-fg-tertiary truncate">{r.receivedDate}{r.notes ? ` · ${r.notes}` : ""}{r.receivedByName ? ` · by ${r.receivedByName}` : ""}</div>
                </div>
                {canApprove && (
                  <Button size="sm" variant="ghost" disabled={busy === `dr-${r.id}`} onClick={() => void removeReceipt(r)}>
                    <Icon name="trash" size={13} className="text-error" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {canApprove && (
          <div className="flex gap-2 flex-wrap items-end">
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Date</span><Input className="mt-1 w-32" type="date" value={rcvDate} onChange={e => setRcvDate(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Qty</span><Input className="mt-1 w-20" type="number" min={1} value={rcvQty} onChange={e => setRcvQty(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Unit ₹</span><Input className="mt-1 w-28" type="number" min={0} value={rcvPrice} onChange={e => setRcvPrice(e.target.value)} /></div>
            <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span><Input className="mt-1" value={rcvNotes} onChange={e => setRcvNotes(e.target.value)} placeholder="e.g. delivery chalan 441" /></div>
            <Button size="sm" disabled={busy === `r-${po.id}` || !(Number(rcvPrice) >= 0) || !(Number(rcvQty) >= 1)} onClick={() => void addReceipt(po)}>
              {busy === `r-${po.id}` ? <Spinner size={12} /> : "Add receipt"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const columns: Column<PurchaseOrder>[] = [
    {
      key: "detail", header: "PO", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{r.poNo} · {fmtRupees(r.amount)}</div>
          <div className="text-[11px] text-fg-tertiary truncate">{[r.items, r.deliveryDate && `due ${r.deliveryDate}`, r.vendorName && `vendor ${r.vendorName}`, r.quoteItem && `from quote "${r.quoteItem}"`].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      ),
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: r => canApprove ? (
        <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as POStatus; void run(`s-${r.id}`, c => setPOStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
      ) : <span className="text-xs text-fg-secondary">{r.status}</span>,
    },
    {
      key: "delivery", header: "", className: "flex-shrink-0",
      render: r => (
        <Button size="sm" variant="ghost" onClick={() => setOpenPoId(openPoId === r.id ? null : r.id)}>
          {openPoId === r.id ? "Close" : "Receipts"}
        </Button>
      ),
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
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Vendor</span><Select className="mt-1 min-w-[140px]" value={vendorId} onChange={e => setVendorId(e.target.value)} options={[{ value: "", label: "Unassigned" }, ...vendors.map(v => ({ value: v.id, label: v.name }))]} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !poNo.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Create"}</Button>
        </Card>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        error={error}
        emptyMessage="No purchase orders."
      />
      {openPoId && (() => {
        const po = rows.find(x => x.id === openPoId);
        if (!po) return null;
        return receiptPanel(po);
      })()}
    </div>
  );
}
