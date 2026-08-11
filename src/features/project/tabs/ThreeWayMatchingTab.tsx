// SiteTrack Pro — Three-Way Matching View (v6 Phase 5).
// PO → GRN → Invoice matching interface for finance/procurement teams.

import { useCallback, useEffect, useState } from "react";
import { useOrgSwitcher } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon, Button } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { listUnmatchedReceipts, matchReceiptToInvoice, type POReceipt } from "@/app/advancedProcurementQueries";
import { listInvoices, type Invoice } from "@/app/financeQueries";
import { getClient } from "@/lib/supabase";

export function ThreeWayMatchingView({ projectId }: { projectId: string }): JSX.Element {
  useOrgSwitcher();

  const [unmatched, setUnmatched] = useState<POReceipt[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<POReceipt | null>(null);
  const [matchInvoiceId, setMatchInvoiceId] = useState<string>("");
  const [matchAmount, setMatchAmount] = useState<string>("");
  const [matching, setMatching] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [uRes, invRes] = await Promise.all([
      listUnmatchedReceipts(client, projectId),
      listInvoices(client, projectId),
    ]);
    if (uRes.ok) setUnmatched(uRes.data); else setError(uRes.error);
    if (invRes.ok) setInvoices(invRes.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) return <div className="grid place-items-center py-8"><Spinner size={24} /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;

  const columns: Column<POReceipt>[] = [
    { key: "id", header: "Receipt", className: "font-mono text-xs", render: r => r.id.slice(0, 8) },
    { key: "poId", header: "PO", className: "font-mono text-xs", render: r => r.poId.slice(0, 8) },
    { key: "receivedDate", header: "Received", className: "text-sm", render: r => r.receivedDate },
    { key: "qty", header: "Qty", className: "text-right text-sm", render: r => String(r.qty) },
    { key: "amount", header: "Amount", className: "text-right font-mono text-sm", render: r => fmtRupees(r.amount) },
    { key: "matchStatus", header: "Match", className: "text-center", render: r => {
      const tones: Record<string, "success" | "warning" | "neutral" | "danger"> = {
        matched: "success", partial: "warning", disputed: "danger", unmatched: "neutral",
      };
      return <Badge tone={tones[r.matchStatus] ?? "neutral"}>{r.matchStatus}</Badge>;
    }},
    { key: "matchedAmount", header: "Matched", className: "text-right font-mono text-sm", render: r => r.matchedAmount > 0 ? fmtRupees(r.matchedAmount) : "—" },
  ];

  const handleMatch = async () => {
    if (!selectedReceipt || !matchInvoiceId || !matchAmount) return;
    setMatching(true);
    const client = await getClient(); if (!client) { setMatching(false); return; }
    const res = await matchReceiptToInvoice(client, selectedReceipt.id, matchInvoiceId, Number(matchAmount));
    if (res.ok) {
      setSelectedReceipt(null);
      setMatchInvoiceId("");
      setMatchAmount("");
      void reload();
    } else {
      setError(res.error);
    }
    setMatching(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Three-Way Matching (PO → GRN → Invoice)</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Unmatched Receipts ({unmatched.length})</div>
        {unmatched.length === 0 ? (
          <div className="text-center py-4 text-fg-tertiary">All receipts matched ✓</div>
        ) : (
          <DataTable columns={columns} rows={unmatched} rowKey={r => r.id} onRowClick={r => {
            setSelectedReceipt(r);
            setMatchAmount(String(r.amount - r.matchedAmount));
          }} emptyMessage="No unmatched receipts." />
        )}
      </Card>

      {selectedReceipt && (
        <Card padding="sm" className="border-l-2 border-accent" title={<div>
          <div className="font-semibold text-fg-primary">Match Receipt: {selectedReceipt.id.slice(0, 8)}</div>
          <div className="text-sm text-fg-secondary">PO: {selectedReceipt.poId.slice(0, 8)} · Amount: {fmtRupees(selectedReceipt.amount)} · Remaining: {fmtRupees(selectedReceipt.amount - selectedReceipt.matchedAmount)}</div>
        </div>} action={<Button size="sm" variant="ghost" onClick={() => setSelectedReceipt(null)}>
          <Icon name="x" size={14} />
        </Button>}>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Invoice</label>
              <Select value={matchInvoiceId} onChange={e => setMatchInvoiceId(e.target.value)} options={invoices.map(i => ({ value: i.id, label: `${i.no} · ${fmtRupees(i.amount + i.gst - i.tds)} · ${i.status}` }))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Amount to Match</label>
              <Input type="number" value={matchAmount} onChange={e => setMatchAmount(e.target.value)} placeholder="₹" />
            </div>
            <div className="flex items-end">
              <Button onClick={handleMatch} disabled={matching || !matchInvoiceId || !matchAmount}>
                {matching ? <Spinner size={14} /> : "Match"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {invoices.length > 0 && (
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Available Invoices for Matching ({invoices.length})</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {invoices.map(inv => (
              <div key={inv.id} className="p-2 bg-bg-secondary rounded border border-default">
                <div className="font-mono text-sm">{inv.no}</div>
                <div className="text-xs text-fg-secondary">{inv.status} · {fmtRupees(inv.amount + inv.gst - inv.tds)}</div>
                <div className="text-xs text-fg-tertiary">{inv.issuedDate ? inv.issuedDate.slice(0, 10) : "—"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}