import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listReceipts, addReceipt, deleteReceipt, listPaymentTimeline, type Receipt, type ReceiptInput, type PaymentTimelineEvent } from "@/app/receiptQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const METHODS = [{ value: "bank", label: "Bank" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "cheque", label: "Cheque" }, { value: "other", label: "Other" }];
const METHOD_TONE: Record<string, "info" | "success" | "neutral"> = { bank: "info", upi: "success", cash: "neutral", cheque: "neutral", other: "neutral" };

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
  const [timeline, setTimeline] = useState<PaymentTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<"payments" | "timeline">("payments");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [receiptsRes, timelineRes] = await Promise.all([
      listReceipts(client, projectId, targetType, targetId),
      listPaymentTimeline(client, projectId, targetType, targetId),
    ]);
    if (receiptsRes.ok) setRows(receiptsRes.data); else setError(receiptsRes.error);
    if (timelineRes.ok) setTimeline(timelineRes.data); else setError(timelineRes.error);
    setLoading(false);
  }, [projectId, targetType, targetId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    await run("add", c => addReceipt(c, { projectId, targetType, targetId, amount: amt, method: method as ReceiptInput["method"], reference: reference.trim() || undefined, receivedOn: receiptDate || null }), {
      apply: () => setRows(prev => [{ id: "tmp-" + Date.now(), projectId, targetType, targetId, amount: amt, method: method as Receipt["method"], receivedOn: receiptDate || null, reference: reference.trim() || null, notes: null, receivedByName: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== "tmp-" + Date.now())),
    });
    setAmount(""); setReference("");
  };

  const KIND_LABEL: Record<string, string> = {
    payment_received: "Payment Received",
    status_changed: "Status Changed",
    payment_method_updated: "Method Updated",
    reference_updated: "Reference Updated",
  };

  const KIND_ICON: Record<string, "download" | "refresh" | "send" | "arrow"> = {
    payment_received: "download",
    status_changed: "refresh",
    payment_method_updated: "send",
    reference_updated: "arrow",
  };

  const KIND_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
    payment_received: "success",
    status_changed: "info",
    payment_method_updated: "warning",
    reference_updated: "neutral",
  };

  const fmtDate = (iso: string | null): string => (iso ? (iso.slice(0, 10) || "—") : "—");
  const fmtDateTime = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="mt-2 border-t border-default pt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Payments</div>
        <div className="text-[11px] text-fg-secondary">{summary}</div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setTab("payments")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${tab === "payments" ? "bg-panel text-fg-primary shadow-sm" : "text-fg-secondary hover:text-fg-primary"}`}
        >
          Payments
        </button>
        <button
          onClick={() => setTab("timeline")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${tab === "timeline" ? "bg-panel text-fg-primary shadow-sm" : "text-fg-secondary hover:text-fg-primary"}`}
        >
          <Icon name="activity" size={12} className="inline mr-1" /> Timeline
        </button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="grid place-items-center py-4"><Spinner size={16} /></div>
      ) : tab === "payments" ? (
        <>
          {canPay && (
            <div className="flex gap-1.5 flex-wrap items-center mb-2">
              <Input fit className="w-24" type="number" placeholder="₹" value={amount} onChange={e => setAmount(e.target.value)} />
              <Select fit className="w-auto text-xs" value={method} onChange={e => setMethod(e.target.value as "bank" | "cash" | "upi" | "cheque" | "other")} options={METHODS} />
              <Input fit className="w-32" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
              <Input fit className="w-36 flex-1 min-w-[120px]" placeholder="Ref / note" value={reference} onChange={e => setReference(e.target.value)} />
              <Button size="sm" onClick={() => void add()} disabled={!amount || Number(amount) <= 0 || busy === "add"}>{busy === "add" ? <Spinner size={12} /> : "Add"}</Button>
            </div>
          )}
          {rows.length === 0 ? (
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
        </>
      ) : (
        <div className="space-y-2">
          {timeline.length === 0 ? (
            <div className="text-center py-8 text-fg-tertiary">
              <Icon name="activity" size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No timeline events yet.</p>
              <p className="text-xs text-fg-tertiary mt-1">Payments and status changes will appear here.</p>
            </div>
          ) : (
            timeline.map(e => (
              <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-elevated border border-default">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: `var(--color-${KIND_TONE[e.kind]}-bg)`, color: `var(--color-${KIND_TONE[e.kind]})` }}>
                  <Icon name={KIND_ICON[e.kind]} size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg-primary">{KIND_LABEL[e.kind]}</span>
                    <Badge tone={KIND_TONE[e.kind] as "info" | "success" | "warning" | "neutral"}>{e.kind.replace("_", " ")}</Badge>
                  </div>
                  <div className="text-xs text-fg-secondary mt-1">{e.description}</div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-fg-tertiary mt-1">
                    {e.amount != null && <span>₹{Number(e.amount).toLocaleString("en-IN")}</span>}
                    {e.method && <span>{e.method}</span>}
                    {e.reference && <span>{e.reference}</span>}
                    {e.oldStatus && e.newStatus && <span>{e.oldStatus} → {e.newStatus}</span>}
                    {e.createdByName && <span>by {e.createdByName}</span>}
                    <span>{fmtDateTime(e.createdAt)}</span>
                  </div>
                </div>
              </div>
)))}
          </div>
        )}
    </div>
  );
}