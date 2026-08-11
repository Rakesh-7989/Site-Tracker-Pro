// SiteTrack Pro — Project P&L with Earned Value (v6 Phase 6).
// Project-level financial statement with EVM metrics, cost breakdown, forecast.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon, Button, ProgressBar } from "@/components/ui/atoms";
import { DataTable } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { getProjectPnL, recomputeProjectFinancials, computeWipAgingBuckets, listWipAging, type ProjectPnL, type WipAgingEntry, type WipAgingBuckets } from "@/app/projectFinancialQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

export function ProjectPnLView({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canView = useCan("budget:view", ctx);

  const [pnl, setPnl] = useState<ProjectPnL | null>(null);
  const [wip, setWip] = useState<WipAgingEntry[]>([]);
  const [wipBuckets, setWipBuckets] = useState<WipAgingBuckets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [pRes, wRes] = await Promise.all([
      getProjectPnL(client, projectId),
      listWipAging(client, projectId),
    ]);
    if (pRes.ok) setPnl(pRes.data); else setError(pRes.error);
    if (wRes.ok) { setWip(wRes.data); setWipBuckets(computeWipAgingBuckets(wRes.data)); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { if (canView) void reload(); }, [canView, reload]);
  const { busy, run } = useAction(reload, setError);

  if (!canView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-fg-primary">Project P&L & Earned Value</h2>
          <Badge tone="neutral">Requires budget:view</Badge>
        </div>
        <div className="text-center py-8 text-fg-tertiary">
          <Icon name="shield" size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Access restricted.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="grid place-items-center py-8"><Spinner size={24} /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!pnl) return <div className="text-center py-8 text-fg-tertiary">No data.</div>;

  const evmCards = [
    { label: "CPI (Cost Performance)", value: pnl.cpi.toFixed(2), tone: pnl.cpi >= 1 ? "success" : pnl.cpi >= 0.9 ? "warning" : "danger" as const },
    { label: "SPI (Schedule Performance)", value: pnl.spi.toFixed(2), tone: pnl.spi >= 1 ? "success" : pnl.spi >= 0.9 ? "warning" : "danger" as const },
    { label: "EAC (Estimate at Completion)", value: fmtRupees(pnl.eac), tone: pnl.eac <= pnl.contractValue ? "success" : "danger" as const },
    { label: "ETC (Estimate to Complete)", value: fmtRupees(pnl.etc), tone: "info" as const },
    { label: "VAC (Variance at Completion)", value: fmtRupees(pnl.vac), tone: pnl.vac >= 0 ? "success" : "danger" as const },
    { label: "Gross Margin", value: `${pnl.grossMarginPct}%`, tone: pnl.grossMarginPct >= 15 ? "success" : pnl.grossMarginPct >= 5 ? "warning" : "danger" as const },
  ];

  const pnlRows = [
    { label: "Contract Value", value: fmtRupees(pnl.contractValue) },
    { label: "Billed Revenue", value: fmtRupees(pnl.billedRevenue) },
    { label: "Recognized Revenue (EV)", value: fmtRupees(pnl.recognizedRevenue) },
    { label: "Actual Cost", value: fmtRupees(pnl.actualCost), tone: "warning" },
    { label: "Committed Cost (POs)", value: fmtRupees(pnl.committedCost), tone: "info" },
    { label: "Total Cost", value: fmtRupees(pnl.totalCost), tone: "danger", bold: true },
    { label: "Gross Profit", value: fmtRupees(pnl.grossProfit), tone: pnl.grossProfit >= 0 ? "success" : "danger" },
    { label: "Gross Margin %", value: `${pnl.grossMarginPct}%`, tone: pnl.grossMarginPct >= 0 ? "success" : "danger" },
    { label: "", value: "", divider: true },
    { label: "Forecast Final Cost", value: fmtRupees(pnl.forecastFinalCost), tone: pnl.forecastFinalCost <= pnl.contractValue ? "success" : "danger" },
    { label: "Cost to Complete", value: fmtRupees(pnl.costToComplete) },
    { label: "Forecast Profit", value: fmtRupees(pnl.forecastProfit), tone: pnl.forecastProfit >= 0 ? "success" : "danger" },
    { label: "Forecast Margin %", value: `${pnl.forecastMarginPct}%`, tone: pnl.forecastMarginPct >= 15 ? "success" : pnl.forecastMarginPct >= 5 ? "warning" : "danger" },
  ];

  const costBreakdown = [
    { label: "Labor", value: fmtRupees(pnl.laborCost), pct: pnl.actualCost > 0 ? Math.round((pnl.laborCost / pnl.actualCost) * 100) : 0 },
    { label: "Material", value: fmtRupees(pnl.materialCost), pct: pnl.actualCost > 0 ? Math.round((pnl.materialCost / pnl.actualCost) * 100) : 0 },
    { label: "Subcontractor", value: fmtRupees(pnl.subcontractorCost), pct: pnl.actualCost > 0 ? Math.round((pnl.subcontractorCost / pnl.actualCost) * 100) : 0 },
    { label: "Overhead", value: fmtRupees(pnl.overheadCost), pct: pnl.actualCost > 0 ? Math.round((pnl.overheadCost / pnl.actualCost) * 100) : 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-lg font-bold text-fg-primary">Project P&L & Earned Value</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void run("recompute", async () => { await recomputeProjectFinancials(await getClient(), projectId); await reload(); return { ok: true }; })} disabled={busy === "recompute"}>
            {busy === "recompute" ? <Spinner size={14} /> : <><Icon name="refresh" size={14} className="mr-1" /> Recompute</>}
          </Button>
          <Button size="sm" onClick={() => void reload()}>
            <Icon name="refresh" size={14} className="mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* EVM Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {evmCards.map(e => (
          <Card key={e.label} className="p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">{e.label}</div>
            <div className="text-lg font-display font-bold text-fg-primary mt-0.5">{e.value}</div>
            <ProgressBar value={e.label.includes("CPI") ? Math.min(Number(e.value) * 100, 100) : e.label.includes("SPI") ? Math.min(Number(e.value) * 100, 100) : 50} color={e.tone === "success" ? "emerald" : e.tone === "warning" ? "orange" : "red"} className="w-full mt-1" />
          </Card>
        ))}
      </div>

      {/* P&L Table */}
      <Card className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Profit & Loss</div>
        <div className="space-y-1">
          {pnlRows.map(r => (
            <div key={r.label} className={`flex justify-between py-1 text-sm ${r.divider ? "border-t border-default mt-2 pt-2" : ""}`}>
              <span className="text-fg-secondary">{r.label}</span>
              <span className={`font-mono font-semibold ${r.tone ? `text-${r.tone}` : ""} ${r.bold ? "font-bold text-lg" : ""}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Cost Breakdown */}
      <Card className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Cost Breakdown</div>
        <div className="space-y-2">
          {costBreakdown.map(c => (
            <div key={c.label} className="flex items-center gap-3">
              <span className="text-sm text-fg-secondary w-32">{c.label}</span>
              <ProgressBar value={c.pct} color="orange" className="flex-1 h-2" />
              <span className="text-right font-mono text-sm w-24">{c.value}</span>
              <span className="text-xs text-fg-tertiary w-12">{c.pct}%</span>
            </div>
          ))}
        </div>
      </Card>

      {/* WIP Aging Summary */}
      {wipBuckets && wipBuckets.total > 0 && (
        <Card padding="sm" className="border-l-2 border-warning" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-warning">⚠ WIP Aging ({wip.length} entries · {fmtRupees(wipBuckets.total)} unbilled)</div>} action={<Badge tone="warning">{wipBuckets.over120 > 0 ? "Over 120 days" : wipBuckets.days91_120 > 0 ? "91-120 days" : "Current"}</Badge>}>
          <div className="grid grid-cols-5 gap-2 text-sm">
            <div className="text-center"><div className="text-success font-bold">{fmtRupees(wipBuckets.current)}</div><div className="text-xs text-fg-tertiary">0-30 days</div></div>
            <div className="text-center"><div className="text-info font-bold">{fmtRupees(wipBuckets.days31_60)}</div><div className="text-xs text-fg-tertiary">31-60 days</div></div>
            <div className="text-center"><div className="text-warning font-bold">{fmtRupees(wipBuckets.days61_90)}</div><div className="text-xs text-fg-tertiary">61-90 days</div></div>
            <div className="text-center"><div className="text-warning font-bold">{fmtRupees(wipBuckets.days91_120)}</div><div className="text-xs text-fg-tertiary">91-120 days</div></div>
            <div className="text-center"><div className="text-danger font-bold">{fmtRupees(wipBuckets.over120)}</div><div className="text-xs text-fg-tertiary">120+ days</div></div>
          </div>
        </Card>
      )}

      {/* WIP Detail */}
      {wip.length > 0 && (
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">WIP Detail ({wip.length})</div>
          <DataTable dense columns={[
            { key: "category", header: "Category", className: "text-center", render: e => <Badge tone={e.category === "labor" ? "info" : e.category === "material" ? "success" : "warning"}>{e.category}</Badge> },
            { key: "description", header: "Description", className: "flex-1 min-w-0", render: e => <span className="truncate">{e.description ?? "—"}</span> },
            { key: "amount", header: "Amount", className: "text-right font-mono text-sm", render: e => fmtRupees(e.amount) },
            { key: "billedAmount", header: "Billed", className: "text-right font-mono text-sm", render: e => fmtRupees(e.billedAmount) },
            { key: "agingDays", header: "Aging", className: "text-center", render: e => <Badge tone={e.agingDays > 120 ? "danger" : e.agingDays > 90 ? "warning" : "info"}>{e.agingDays} days</Badge> },
            { key: "status", header: "Status", className: "text-center", render: e => <Badge tone={e.status === "open" ? "warning" : e.status === "partially_billed" ? "info" : "success"}>{e.status}</Badge> },
          ]} rows={wip} rowKey={e => e.id} emptyMessage="No WIP entries." />
        </Card>
      )}
    </div>
  );
}