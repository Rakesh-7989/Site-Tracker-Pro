import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listInvoices, createInvoice, setInvoiceStatus, deleteInvoice, invoiceTaxBreakup, fmtRupees, type Invoice, type InvoiceStatus } from "@/app/queries/financeQueries";
import { publishInvoiceGenerated } from "@/app/queries/outboxQueries";
import { ReceiptsPanel } from "./ReceiptsPanel";

import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";

const STATUS_TONE: Record<InvoiceStatus, "neutral" | "success" | "info" | "danger"> = {
  sent: "neutral", paid: "success", overdue: "danger", cancelled: "danger",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  sent: "Sent", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};

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
  const draftTax = invoiceTaxBreakup(Number(amount) || 0, Number(gst) || 0, Number(tds) || 0);

  const [summary, setSummary] = useState({ total: 0, paid: 0, outstanding: 0, count: 0 });

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listInvoices(client, projectId);
    if (res.ok) {
      setRows(res.data);
      const totals = res.data.reduce((acc, r) => {
        acc.count++;
        acc.total += r.amount || 0;
        if (r.status === "paid") acc.paid += r.amount || 0;
        else acc.outstanding += r.amount || 0;
        return acc;
      }, { total: 0, paid: 0, outstanding: 0, count: 0 });
      setSummary(totals);
    } else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    const amt = Number(amount);
    if (!no.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", async c => {
      const res = await createInvoice(c, { projectId, no: no.trim(), amount: amt, gst: Number(gst) || 0, tds: Number(tds) || 0 });
      if (res.ok && activeOrg?.orgId) {
        await publishInvoiceGenerated(c, { orgId: activeOrg.orgId, projectId, invoiceId: res.data.id, invoiceNo: no.trim(), amount: amt });
      }
      return res;
    }, {
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
        <Select fit className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as InvoiceStatus; void run(`s-${r.id}`, c => setInvoiceStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={[{"value": "sent", "label": "Sent"}, {"value": "paid", "label": "Paid"}, {"value": "overdue", "label": "Overdue"}, {"value": "cancelled", "label": "Cancelled"}]} />
      ) : <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
    ...(canCreate ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: Invoice) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteInvoice(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <span className="text-error">✕</span>
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Invoices</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      {/* Summary stats */}
      {canCreate && (
        <Card className="p-3 flex flex-col sm:flex-row gap-2 sm:gap-0 items-end sm:items-center">
          <Card className="flex-1 sm:w-48 p-2 bg-bg-secondary rounded-md">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Total</span>
            <div className="text-xl font-semibold text-fg-primary">{fmtRupees(summary.total)}</div>
            <span className="text-[11px] text-fg-tertiary">{summary.count} invoices</span>
          </Card>
          <Card className="flex-1 sm:w-48 p-2 bg-bg-secondary rounded-md">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Paid</span>
            <div className="text-xl font-success text-success">{fmtRupees(summary.paid)}</div>
            <span className="text-[11px] text-fg-tertiary">{summary.paid > 0 ? `${(summary.paid / summary.total * 100).toFixed(1)}%` : "0%"}</span>
          </Card>
          <Card className="flex-1 sm:w-48 p-2 bg-bg-secondary rounded-md">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Outstanding</span>
            <div className="text-xl font-danger text-error">{fmtRupees(summary.outstanding)}</div>
            <span className="text-[11px] text-fg-tertiary">{summary.outstanding > 0 ? `${(summary.outstanding / summary.total * 100).toFixed(1)}%` : "0%"}</span>
          </Card>
        </Card>
      )}

      {canCreate && (
        <Card className="p-3 flex flex-col sm:flex-row gap-2 sm:flex-wrap items-end sm:items-center">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Invoice No</span><Input fit className="mt-1 w-32" placeholder="INV-001" value={no} onChange={e => setNo(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Amount ₹</span><Input fit className="mt-1 w-28" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">GST %</span><Input fit className="mt-1 w-20" type="number" suffix="%" value={gst} onChange={e => setGst(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">TDS %</span><Input fit className="mt-1 w-20" type="number" suffix="%" value={tds} onChange={e => setTds(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !no.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Raise"}</Button>
          <div className="w-full text-[11px] text-fg-secondary">
            GST {fmtRupees(draftTax.gstAmount)} · TDS {fmtRupees(draftTax.tdsAmount)} · <span className="text-fg-primary font-semibold">Net receivable {fmtRupees(draftTax.netReceivable)}</span>
          </div>
        </Card>
      )}

      {loading ? (
        <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-fg-secondary">
          <span className="text-4xl mb-3">📄</span>
          <p>No invoices raised yet.</p>
          <p className="text-[12px] text-fg-tertiary">Create the first invoice using the form above.</p>
        </div>
      ) : (
        <DataTable dense columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} />
      )}
    </div>
  );
}