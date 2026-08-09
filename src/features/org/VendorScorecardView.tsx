// SiteTrack Pro — Vendor Scorecard View (v6 Phase 5).
// Org-wide vendor performance dashboard with scorecards, trends, and drill-down.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon, Button, ProgressBar } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { listVendorPerformance, recomputeAllVendorPerformance, vendorPerformanceTier, type VendorPerformance } from "@/app/advancedProcurementQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

export function VendorScorecardView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId };
  const canView = useCan("procurement:view", ctx);

  const [vendors, setVendors] = useState<VendorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<VendorPerformance | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listVendorPerformance(client, ctx.orgId ?? "");
    if (res.ok) setVendors(res.data); else setError(res.error);
    setLoading(false);
  }, [ctx.orgId]);

  useEffect(() => { if (canView) void reload(); }, [canView, reload]);
  const { busy, run } = useAction(reload, setError);

  if (!canView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-fg-primary">Vendor Scorecards</h2>
          <Badge tone="neutral">Requires procurement:view</Badge>
        </div>
        <div className="text-center py-8 text-fg-tertiary">
          <Icon name="shield" size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Access restricted. Contact your org admin.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="grid place-items-center py-8"><Spinner size={24} /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;

  const columns: Column<VendorPerformance>[] = [
    { key: "vendorId", header: "Vendor", className: "flex-1 min-w-0", render: v => <div className="truncate font-medium">{v.vendorId}</div> },
    { key: "overallScore", header: "Score", className: "text-center", render: v => {
      const { tier, label, color } = vendorPerformanceTier(v.overallScore);
      return <Badge tone={color as "success" | "info" | "warning" | "danger" | "neutral"}>{v.overallScore} <span className="ml-1 text-[10px]">{label} ({tier})</span></Badge>;
    }},
    { key: "deliveryScore", header: "Delivery", className: "text-center", render: v => <ProgressBar value={v.deliveryScore} color="emerald" className="w-24" /> },
    { key: "qualityScore", header: "Quality", className: "text-center", render: v => <ProgressBar value={v.qualityScore} color="blue" className="w-24" /> },
    { key: "financialScore", header: "Financial", className: "text-center", render: v => <ProgressBar value={v.financialScore} color="orange" className="w-24" /> },
    { key: "totalPos", header: "POs", className: "text-center text-sm", render: v => String(v.totalPos) },
    { key: "onTimeDeliveries", header: "On Time", className: "text-center text-sm", render: v => <span className="text-success">{v.onTimeDeliveries}</span> },
    { key: "lateDeliveries", header: "Late", className: "text-center text-sm", render: v => <span className="text-danger">{v.lateDeliveries}</span> },
    { key: "totalAmountOrdered", header: "Ordered", className: "text-right font-mono text-sm", render: v => fmtRupees(v.totalAmountOrdered) },
    { key: "totalAmountDelivered", header: "Delivered", className: "text-right font-mono text-sm", render: v => fmtRupees(v.totalAmountDelivered) },
    { key: "periodStart", header: "Period", className: "text-center text-sm", render: v => `${v.periodStart} → ${v.periodEnd}` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-lg font-bold text-fg-primary">Vendor Scorecards</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void run("recompute", async () => { await recomputeAllVendorPerformance(await getClient(), ctx.orgId ?? ""); await reload(); return { ok: true }; })} disabled={busy === "recompute"}>
            {busy === "recompute" ? <Spinner size={14} /> : <><Icon name="refresh" size={14} className="mr-1" /> Recompute All</>}
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Total Vendors</div>
          <div className="text-lg font-display font-bold text-fg-primary mt-0.5">{vendors.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Avg Score</div>
          <div className="text-lg font-display font-bold text-fg-primary mt-0.5">
            {vendors.length > 0 ? Math.round(vendors.reduce((s, v) => s + v.overallScore, 0) / vendors.length) : 0}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Tier A (Preferred)</div>
          <div className="text-lg font-display font-bold text-success mt-0.5">
            {vendors.filter(v => vendorPerformanceTier(v.overallScore).tier === "A").length}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Tier D (At Risk)</div>
          <div className="text-lg font-display font-bold text-danger mt-0.5">
            {vendors.filter(v => vendorPerformanceTier(v.overallScore).tier === "D").length}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Total POs</div>
          <div className="text-lg font-display font-bold text-fg-primary mt-0.5">
            {vendors.reduce((s, v) => s + v.totalPos, 0)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Total Ordered</div>
          <div className="text-lg font-display font-bold text-fg-primary mt-0.5">
            {fmtRupees(vendors.reduce((s, v) => s + v.totalAmountOrdered, 0))}
          </div>
        </Card>
      </div>

      {/* Vendor Table */}
      <Card className="p-3">
        <DataTable columns={columns} rows={vendors} rowKey={v => v.id} emptyMessage="No vendor performance data." onRowClick={v => setSelectedVendor(v)} />
      </Card>

      {/* Vendor Detail Modal */}
      {selectedVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-fg-primary">Vendor Scorecard Detail</h3>
              <Button size="sm" variant="ghost" onClick={() => setSelectedVendor(null)}>
                <Icon name="x" size={18} />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Card className="p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Overall Score</div>
                <div className="text-3xl font-display font-bold text-fg-primary mt-1">{selectedVendor.overallScore}</div>
                <div className="text-sm text-fg-secondary mt-1">
                  {vendorPerformanceTier(selectedVendor.overallScore).label} ({vendorPerformanceTier(selectedVendor.overallScore).tier})
                </div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Delivery</div>
                <ProgressBar value={selectedVendor.deliveryScore} color="emerald" className="w-full mt-1" />
              </Card>
              <Card className="p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Quality</div>
                <ProgressBar value={selectedVendor.qualityScore} color="blue" className="w-full mt-1" />
              </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Card className="p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Financial</div>
                <ProgressBar value={selectedVendor.financialScore} color="orange" className="w-full mt-1" />
              </Card>
              <Card className="p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">On-Time Rate</div>
                <div className="text-2xl font-display font-bold text-success mt-1">
                  {selectedVendor.totalPos > 0 ? Math.round((selectedVendor.onTimeDeliveries / selectedVendor.totalPos) * 100) : 0}%
                </div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">POs in Period</div>
                <div className="text-2xl font-display font-bold text-fg-primary mt-1">{selectedVendor.totalPos}</div>
              </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Card className="p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Delivery Metrics</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>On-Time</span><span className="text-success font-medium">{selectedVendor.onTimeDeliveries}</span></div>
                  <div className="flex justify-between"><span>Late</span><span className="text-danger font-medium">{selectedVendor.lateDeliveries}</span></div>
                  <div className="flex justify-between"><span>Partial</span><span className="text-warning font-medium">{selectedVendor.partialDeliveries}</span></div>
                  <div className="flex justify-between"><span>Qty Delivered</span><span className="font-mono">{selectedVendor.totalQtyDelivered}</span></div>
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Financial</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Ordered</span><span className="font-mono text-fg-primary">{fmtRupees(selectedVendor.totalAmountOrdered)}</span></div>
                  <div className="flex justify-between"><span>Delivered</span><span className="font-mono text-success">{fmtRupees(selectedVendor.totalAmountDelivered)}</span></div>
                  <div className="flex justify-between"><span>Invoiced</span><span className="font-mono">{fmtRupees(selectedVendor.totalAmountInvoiced)}</span></div>
                  <div className="flex justify-between"><span>Avg Payment Days</span><span>{selectedVendor.avgPaymentDays ? selectedVendor.avgPaymentDays + " days" : "—"}</span></div>
                </div>
              </Card>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-default">
              <Button onClick={() => setSelectedVendor(null)}>Close</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}