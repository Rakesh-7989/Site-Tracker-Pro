// SiteTrack Pro — payment receipts panel (#30).
// Inline add-form + list of receipts against a single target (an invoice or an
// RA bill), with live reconciliation (received vs outstanding). Embeds in the
// Invoices / RA Bills tabs. Mirrors the tab CRUD pattern (useAction + optimistic).

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listReceipts, addReceipt, deleteReceipt, type Receipt, type ReceiptInput } from "@/app/receiptQueries";

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const METHODS = [{ value: "bank", label: "Bank" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "cheque", label: "Cheque" }, { value: "other", label: "Other" }];
const METHOD_TONE: Record<string, "info" | "success" | "neutral"> = { bank: "info", upi: "success", cash: "neutral", cheque: "neutral", other: "neutral" };

const fmtDate = (iso: string | null): string => (iso ? (iso.slice(0, 10) || "—") : "—");

export function ReceiptsPanel({ projectId, targetType, targetId, summary }: {
  projectId: string;
  targetType: ReceiptInput["targetType"];
  targetId: string;
  summary: string;
}): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canPay = useCan(targetType === "invoice" ? "invoice:approve" : "rabill:approve", ctx);

  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listReceipts(client, projectId, targetType, targetId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId, targetType, targetId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const received = rows.reduce((s, r) => s + r.amount, 0);

  const add = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => addReceipt(c, { projectId, targetType, targetId, amount: amt, method: method as ReceiptInput["method"], reference: reference.trim() || undefined, receivedOn: receiptDate || null }), {
      apply: () => setRows(prev => [{ id: tmpId, projectId, targetType, targetId, amount: amt, method: method as Receipt["method"], receivedOn: receiptDate || null, reference: reference.trim() || null, notes: null, receivedByName: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setAmount(""); setReference("");
  };

  return (
    <div className="mt-2 border-t border-default pt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Payments</div>
        <div className="text-[11px] text-fg-secondary"><Badge tone="success">{fmtRupees(received)}</Badge> received · {summary}</div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {canPay && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <Input className="w-24" type="number" placeholder="₹" value={amount} onChange={e => setAmount(e.target.value)} />
          <Select className="w-auto text-xs" value={method} onChange={e => setMethod(e.target.value)} options={METHODS} />
          <Input className="w-32" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
          <Input className="w-36 flex-1 min-w-[120px]" placeholder="Ref / note" value={reference} onChange={e => setReference(e.target.value)} />
          <Button size="sm" onClick={() => void add()} disabled={!amount || Number(amount) <= 0 || busy === "add"}>{busy === "add" ? <Spinner size={12} /> : "Add"}</Button>
        </div>
      )}
      {loading ? (
        <div className="grid place-items-center py-4"><Spinner size={16} /></div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-fg-tertiary py-1">No payments recorded.</div>
      ) : (
        <div className="space-y-1">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 text-xs">
              <Badge tone={METHOD_TONE[r.method]}>{r.method}</Badge>
              <span className="font-mono text-fg-primary">{fmtRupees(r.amount)}</span>
              <span className="text-fg-tertiary">{fmtDate(r.receivedOn)}</span>
              {r.reference ? <span className="text-fg-secondary truncate">{r.reference}</span> : null}
              {r.receivedByName ? <span className="text-fg-tertiary truncate">by {r.receivedByName}</span> : null}
              {canPay && (
                <button className="ml-auto text-error hover:opacity-70" onClick={() => void run(`d-${r.id}`, c => deleteReceipt(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}