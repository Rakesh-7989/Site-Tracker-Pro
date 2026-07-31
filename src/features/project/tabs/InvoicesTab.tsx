import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listInvoices, createInvoice, setInvoiceStatus, deleteInvoice, fmtRupees, type Invoice, type InvoiceStatus } from "@/app/financeQueries";

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
    await run("add", c => createInvoice(c, { projectId, no: no.trim(), amount: amt }), {
      apply: () => setRows(prev => [{ id: tmpId, no: no.trim(), amount: amt, gst: 18, tds: 2, status: "sent" as InvoiceStatus, issuedDate: new Date().toISOString().slice(0, 10) }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setNo(""); setAmount("");
  };

  const columns: Column<Invoice>[] = [
    {
      key: "detail", header: "Invoice", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{r.no} · {fmtRupees(r.amount)}</div>
          <div className="text-[11px] text-fg-tertiary">{r.issuedDate ? `Issued ${r.issuedDate}` : ""} · GST {r.gst}% · TDS {r.tds}%</div>
        </div>
      ),
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
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Amount ₹</span><Input className="mt-1 w-32" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !no.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Raise"}</Button>
          <span className="text-[11px] text-fg-tertiary ml-auto self-center">GST 18% · TDS 2% applied</span>
        </Card>
      )}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No invoices raised." />
    </div>
  );
}
