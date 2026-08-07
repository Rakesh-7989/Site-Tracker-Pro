import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listInvoices, createInvoice, setInvoiceStatus, deleteInvoice, invoiceTaxBreakup, fmtRupees, type Invoice, type InvoiceStatus } from "@/app/financeQueries";
import { ReceiptsPanel } from "./ReceiptsPanel";

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "sent", label: "Sent" }, { value: "paid", label: "Paid" }, { value: "overdue", label: "Overdue" }, { value: "cancelled", label: "Cancelled" }];
const tone = (s: InvoiceStatus): "info" | "success" | "danger" | "neutral" => (s === "paid" ? "success" : s === "overdue" ? "danger" : s === "sent" ? "info" : "neutral");

export function InvoicesTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canCreate = useCan("invoice:create", ctx);
  const canApprove = useCan("invoice:approve", ctx);
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [no, setNo] = useState(""); const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("18"); const [tds, setTds] = useState("2");
  const [openPay, setOpenPay] = useState<string | null>(null);
  const tax = invoiceTaxBreakup(Number(amount) || 0, Number(gst) || 0, Number(tds) || 0);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listInvoices(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const amt = Number(amount);
    if (!no.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createInvoice(c, { projectId, no: no.trim(), amount: amt, gst: Number(gst) || 0, tds: Number(tds) || 0 }), {
      apply: () => setRows(prev => [{ id: tmpId, no: no.trim(), amount: amt, gst: Number(gst) || 0, tds: Number(tds) || 0, status: "sent" as InvoiceStatus, issuedDate: new Date().toISOString().slice(0, 10), source: null, periodFrom: null, periodTo: null, retainerId: null, phaseId: null, lines: [] }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setNo(""); setAmount("");
  };

  const columns: Column<Invoice>[] = [
    {
      key: "detail", header: "Invoice", className: "flex-1 min-w-0",
      render: r => {
        const b = invoiceTaxBreakup(r.amount, r.gst, r.tds);
        return (
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg-primary truncate">{r.no} · {fmtRupees(r.amount)}</div>
            <div className="text-[11px] text-fg-tertiary">{r.issuedDate ? `Issued ${r.issuedDate}` : ""} · GST {r.gst}% · TDS {r.tds}%</div>
            <div className="text-[11px] text-fg-secondary">GST {fmtRupees(b.gstAmount)} · TDS {fmtRupees(b.tdsAmount)} · <span className="text-fg-primary font-semibold">Net {fmtRupees(b.netReceivable)}</span></div>
            <button className="text-[11px] text-accent font-semibold mt-0.5 hover:opacity-70" onClick={() => setOpenPay(openPay === r.id ? null : r.id)}>
              {openPay === r.id ? "Hide payments ▾" : "Payments ▸"}
            </button>
            {r.lines.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {r.lines.map(l => (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-[11px] text-fg-secondary">
                    <span className="truncate">{l.description}{l.qty !== 1 ? ` × ${l.qty}` : ""}</span>
                    <span className="font-mono text-fg-primary flex-shrink-0">{fmtRupees(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {openPay === r.id && (
              <ReceiptsPanel projectId={projectId} targetType="invoice" targetId={r.id} summary={`Net ${fmtRupees(b.netReceivable)}`} />
            )}
          </div>
        );
      },
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: r => canApprove ? (
        <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as InvoiceStatus; void run(`s-${r.id}`, c => setInvoiceStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
      ) : <Badge tone={tone(r.status)}>{r.status}</Badge>,
    },
    ...(canCreate ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: Invoice) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteInvoice(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <Icon name="trash" size={14} className="text-error" />
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Invoices</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canCreate && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Invoice No</span><Input className="mt-1 w-32" placeholder="INV-001" value={no} onChange={e => setNo(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Amount ₹</span><Input className="mt-1 w-28" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">GST %</span><Input className="mt-1 w-20" type="number" value={gst} onChange={e => setGst(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">TDS %</span><Input className="mt-1 w-20" type="number" value={tds} onChange={e => setTds(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !no.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Raise"}</Button>
          <div className="w-full text-[11px] text-fg-secondary">
            GST {fmtRupees(tax.gstAmount)} · TDS {fmtRupees(tax.tdsAmount)} · <span className="text-fg-primary font-semibold">Net receivable {fmtRupees(tax.netReceivable)}</span>
          </div>
        </Card>
      )}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No invoices raised." />
    </div>
  );
}
