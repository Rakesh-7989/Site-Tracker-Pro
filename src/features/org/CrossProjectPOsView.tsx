// SiteTrack Pro — Cross-project Purchase Orders (/pos). Every PO across the
// org's projects in one place, filterable by status. Read-only roll-up
// (org_purchase_orders RPC, migration 88).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOrgSwitcher } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { getOrgPurchaseOrders, poTotals, type CrossPO, type POStatus } from "@/app/crossPoQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const FILTERS = [{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" }];
const tone = (s: POStatus): "neutral" | "warning" | "info" | "success" | "danger" => (s === "delivered" ? "success" : s === "approved" ? "info" : s === "cancelled" ? "danger" : "warning");

export function CrossProjectPOsView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const [rows, setRows] = useState<CrossPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgPurchaseOrders(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const totals = useMemo(() => poTotals(rows), [rows]);
  const shown = filter === "all" ? rows : rows.filter(r => r.status === filter);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-ink-900">Purchase orders</h1>
        <Select className="w-36" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS} />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><div className="text-lg font-bold text-ink-900">{totals.count}</div><div className="text-[11px] text-ink-500">Total POs</div></Card>
          <Card className="p-3"><div className="text-lg font-bold text-ink-900">{fmtRupees(totals.total)}</div><div className="text-[11px] text-ink-500">Value (excl. cancelled)</div></Card>
          <Card className="p-3"><div className="text-lg font-bold text-amber-600">{fmtRupees(totals.byStatus.pending)}</div><div className="text-[11px] text-ink-500">Pending approval</div></Card>
        </div>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : shown.length === 0 ? <Card className="p-8 text-center text-sm text-ink-500"><Icon name="truck" size={24} className="mx-auto text-ink-300 mb-2" />No {filter === "all" ? "" : filter} purchase orders.</Card>
        : <div className="space-y-2">{shown.map(po => (
            <Link key={po.id} to={`/projects/${po.projectId}/po`}>
              <Card className="p-3 flex items-center justify-between gap-3 hover:border-safety-300 transition">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-800 truncate">{po.poNo}{po.vendorName ? ` · ${po.vendorName}` : ""}</div>
                  <div className="text-[11px] text-ink-400 truncate">{po.projectName}{po.items ? ` · ${po.items}` : ""}{po.deliveryDate ? ` · due ${po.deliveryDate}` : ""}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-ink-900">{fmtRupees(po.amount)}</span>
                  <Badge tone={tone(po.status)}>{po.status}</Badge>
                </div>
              </Card>
            </Link>
          ))}</div>}
    </div>
  );
}
