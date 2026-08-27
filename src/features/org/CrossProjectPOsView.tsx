import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrgSwitcher } from "@/auth";
import { Card, Badge, Alert, ProgressBar } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/queries/financeQueries";
import { getOrgPurchaseOrders, poTotals, type CrossPO, type POStatus } from "@/app/queries/crossPoQueries";
import { listPoReceipts, deliveryProgress, type PoReceipt } from "@/app/queries/poReceiptQueries";

import { getClient } from "@/lib/supabase/supabase";
const FILTERS = [{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" }];
const tone = (s: POStatus): "neutral" | "warning" | "info" | "success" | "danger" => (s === "delivered" ? "success" : s === "approved" ? "info" : s === "cancelled" ? "danger" : "warning");

export function CrossProjectPOsView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CrossPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [receiptsByPo, setReceiptsByPo] = useState<Record<string, PoReceipt[]>>({});
  const [receiptsLoading, setReceiptsLoading] = useState<Record<string, boolean>>({});
  const [receiptsError, setReceiptsError] = useState<Record<string, string | null>>({});

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgPurchaseOrders(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const loadReceipts = useCallback(async (poId: string) => {
    setReceiptsLoading(p => ({ ...p, [poId]: true }));
    setReceiptsError(p => ({ ...p, [poId]: null }));
    const client = await getClient();
    if (client) {
      const res = await listPoReceipts(client, poId);
      if (res.ok) setReceiptsByPo(p => ({ ...p, [poId]: res.data }));
      else setReceiptsError(p => ({ ...p, [poId]: res.error }));
    } else {
      setReceiptsError(p => ({ ...p, [poId]: "Backend not configured." }));
    }
    setReceiptsLoading(p => ({ ...p, [poId]: false }));
  }, []);

  const totals = useMemo(() => poTotals(rows), [rows]);
  const shown = filter === "all" ? rows : rows.filter(r => r.status === filter);

  const columns = [
    { key: "po", header: "PO", render: (po: CrossPO) => (
      <div>
        <div className="text-sm font-semibold text-fg-primary truncate">{po.poNo}{po.vendorName ? ` \u00b7 ${po.vendorName}` : ""}</div>
        <div className="text-[11px] text-fg-tertiary truncate">{[po.projectName, po.items, po.deliveryDate && `due ${po.deliveryDate}`, po.requestedByName && `by ${po.requestedByName}`, po.approvedByName && `approved ${po.approvedByName}${po.approvedAt ? ` ${String(po.approvedAt).slice(0, 10)}` : ""}`].filter(Boolean).join(" \u00b7 ") || "—"}</div>
      </div>
    )},
    { key: "amount", header: "Amount", render: (po: CrossPO) => (
      <span className="text-sm font-semibold text-fg-primary">{fmtRupees(po.amount)}</span>
    )},
    { key: "status", header: "Status", render: (po: CrossPO) => (
      <Badge tone={tone(po.status)}>{po.status}</Badge>
    )},
  ];

  const expandedContent = (po: CrossPO) => {
    const receipts = receiptsByPo[po.id] ?? [];
    const pct = deliveryProgress(po.amount, receipts);
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <ProgressBar value={pct} color={pct === 100 ? "emerald" : "orange"} className="flex-1" ariaLabel={`${pct}% delivered`} />
          <div className="text-xs text-fg-secondary whitespace-nowrap">
            {fmtRupees(po.receivedAmount)} of {fmtRupees(po.amount)} received
          </div>
        </div>
        {receiptsLoading[po.id] ? (
          <div className="text-xs text-fg-tertiary">Loading receipts…</div>
        ) : receiptsError[po.id] ? (
          <div className="text-xs text-error">{receiptsError[po.id]}</div>
        ) : receipts.length === 0 ? (
          <div className="text-xs text-fg-tertiary">No receipts recorded yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {receipts.map(r => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 text-xs">
                <div className="text-fg-secondary min-w-0">
                  <span className="font-semibold text-fg-primary">{r.receivedDate || "—"}</span>
                  <span className="text-fg-tertiary"> · {r.qty} × {fmtRupees(r.unitPrice)}</span>
                  {r.receivedByName ? <span className="text-fg-tertiary"> · by {r.receivedByName}</span> : null}
                </div>
                <span className="font-semibold text-fg-primary whitespace-nowrap">{fmtRupees(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-fg-primary">Purchase orders</h1>
        <Select fit className="w-36" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS} />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-3"><div className="text-lg font-bold text-fg-primary">{totals.count}</div><div className="text-[11px] text-fg-secondary">Total POs</div></Card>
          <Card className="p-3"><div className="text-lg font-bold text-fg-primary">{fmtRupees(totals.total)}</div><div className="text-[11px] text-fg-secondary">Value (excl. cancelled)</div></Card>
          <Card className="p-3"><div className="text-lg font-bold text-warning">{fmtRupees(totals.byStatus.pending)}</div><div className="text-[11px] text-fg-secondary">Pending approval</div></Card>
        </div>
      )}
      <DataTable
        dense
        columns={columns}
        rows={shown}
        rowKey={po => po.id}
        loading={loading}
        error={error}
        emptyMessage={filter === "all" ? "No purchase orders." : `No ${filter} purchase orders.`}
        variant="card"
        expandedContent={expandedContent}
        onExpandedChange={(po, expanded) => { if (expanded) void loadReceipts(po.id); }}
        onRowClick={po => navigate(`/projects/${po.projectId}/po`)}
      />
    </div>
  );
}
