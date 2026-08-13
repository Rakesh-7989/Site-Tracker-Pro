// SiteTrack Pro — Org Financial Rollup View (v6 Phase 6).
// Org-wide financial dashboard: aggregated P&L, EVM, budget health across projects.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { Card, Badge, Spinner, Alert, Icon, Button } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ChartCard } from "@/components/ui/ChartCard";
import { LineChart, type ChartDatum } from "@/components/ui/Charts";
import { fmtRupees } from "@/app/financeQueries";
import { getOrgProjectKPIs, orgKPIRollup, getOrgCashFlowForecast, type ProjectKPIs, type CashFlowForecastRow } from "@/app/crossAnalyticsQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const HEALTH_TONE: Record<"green" | "amber" | "red", "success" | "warning" | "neutral"> = {
  green: "success", amber: "warning", red: "neutral",
};
const HEALTH_LABEL: Record<"green" | "amber" | "red", string> = {
  green: "Healthy", amber: "Watch", red: "At Risk",
};

export function OrgFinancialView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const ctx = { orgId: activeOrg?.orgId };
  const canView = useCan("budget:view", ctx);

  const [projects, setProjects] = useState<ProjectKPIs[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [pRes, cRes] = await Promise.all([
      getOrgProjectKPIs(client, ctx.orgId ?? "", memberProjectScope(session)),
      getOrgCashFlowForecast(client, ctx.orgId ?? "", 6, memberProjectScope(session)),
    ]);
    if (pRes.ok) setProjects(pRes.data); else setError(pRes.error);
    if (cRes.ok) setCashFlow(cRes.data);
    setLoading(false);
  }, [ctx.orgId]);

  useEffect(() => { if (canView) void reload(); }, [canView, reload]);
  const { busy, run } = useAction(reload, setError);

  if (!canView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-fg-primary">Org Financial Rollup</h2>
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

  const rollup = orgKPIRollup(projects);

  const statCards = [
    { label: "Projects", value: rollup.projectCount, tone: "info" as const },
    { label: "Total Budget", value: fmtRupees(rollup.totalBudget), tone: "info" as const },
    { label: "Revenue", value: fmtRupees(rollup.totalRevenue), tone: "success" as const },
    { label: "Cost", value: fmtRupees(rollup.totalCost), tone: "warning" as const },
    { label: "Gross Margin", value: `${rollup.totalGrossMarginPct}% (₹${fmtRupees(rollup.totalGrossMargin)})`, tone: rollup.totalGrossMargin >= 0 ? "success" : "danger" as const },
    { label: "Cash In", value: fmtRupees(rollup.totalCashIn), tone: "success" as const },
    { label: "Cash Out", value: fmtRupees(rollup.totalCashOut), tone: "warning" as const },
    { label: "Net Cash Flow", value: fmtRupees(rollup.totalNetCashFlow), tone: rollup.totalNetCashFlow >= 0 ? "success" : "danger" as const },
  ];

  const healthCards = [
    { label: "Healthy", count: rollup.byHealth.green, tone: "success" as const },
    { label: "Watch", count: rollup.byHealth.amber, tone: "warning" as const },
    { label: "At Risk", count: rollup.byHealth.red, tone: "danger" as const },
  ];

  const cashFlowColumns: Column<CashFlowForecastRow>[] = [
    { key: "period", header: "Period", className: "font-mono text-sm", render: r => <span className="font-mono text-sm">{r.period}</span> },
    { key: "projectedIn", header: "Projected In", className: "text-right font-mono text-sm", render: r => <span className="text-success">+{fmtRupees(r.projectedIn)}</span> },
    { key: "projectedOut", header: "Projected Out", className: "text-right font-mono text-sm", render: r => <span className="text-warning">−{fmtRupees(r.projectedOut)}</span> },
    { key: "net", header: "Net", className: "text-right font-mono text-sm font-semibold", render: r => <span className={r.net >= 0 ? "text-success" : "text-danger"}>${r.net >= 0 ? "+" : ""}{fmtRupees(r.net)}</span> },
    { key: "cumulative", header: "Cumulative", className: "text-right font-mono text-sm", render: r => <span className={r.cumulative >= 0 ? "text-success" : "text-danger"}>${r.cumulative >= 0 ? "+" : ""}{fmtRupees(r.cumulative)}</span> },
  ];

  const projectColumns: Column<ProjectKPIs>[] = [
    { key: "projectName", header: "Project", className: "flex-1 min-w-0", render: p => <div className="truncate">{p.projectName}</div> },
    { key: "health", header: "Health", className: "text-center", render: p => <Badge tone={HEALTH_TONE[p.health]}>{HEALTH_LABEL[p.health]}</Badge> },
    { key: "budget", header: "Budget", className: "text-right font-mono text-sm", render: p => fmtRupees(p.budget) },
    { key: "expenses", header: "Expenses", className: "text-right font-mono text-sm", render: p => fmtRupees(p.expenses) },
    { key: "revenue", header: "Revenue", className: "text-right font-mono text-sm", render: p => fmtRupees(p.revenue) },
    { key: "cost", header: "Cost", className: "text-right font-mono text-sm", render: p => fmtRupees(p.cost) },
    { key: "margin", header: "Margin %", className: "text-right font-mono text-sm", render: p => <span className={p.grossMarginPct >= 0 ? "text-success" : "text-danger"}>{p.grossMarginPct}%</span> },
    { key: "netCashFlow", header: "Net Cash", className: "text-right font-mono text-sm", render: p => <span className={p.netCashFlow >= 0 ? "text-success" : "text-danger"}>${p.netCashFlow >= 0 ? "+" : ""}{fmtRupees(p.netCashFlow)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-lg font-bold text-fg-primary">Org Financial Rollup</h2>
        <Button size="sm" onClick={() => void run("refresh", async () => { await reload(); return { ok: true }; })} disabled={busy === "refresh"}>
          {busy === "refresh" ? <Spinner size={14} /> : <><Icon name="refresh" size={14} className="mr-1" /> Refresh</>}
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {statCards.map(s => (
          <Card key={s.label} className="p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">{s.label}</div>
            <div className="text-lg font-display font-bold text-fg-primary mt-0.5">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {healthCards.map(h => (
          <Card key={h.label} className={`p-3 text-center border-l-2 border-${h.tone}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">{h.label}</div>
            <div className="text-2xl font-display font-bold text-fg-primary mt-1">{h.count}</div>
          </Card>
        ))}
      </div>

      {/* By Type Breakdown */}
      <Card className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">By Project Type</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(rollup.byType).map(([type, v]) => (
            <div key={type} className="p-2 bg-bg-secondary rounded">
              <div className="text-xs font-semibold text-fg-primary">{type}</div>
              <div className="text-[11px] text-fg-secondary">{v.count} projects</div>
              <div className="text-sm font-mono text-fg-primary">{fmtRupees(v.revenue)}</div>
              <div className="text-[11px] text-fg-tertiary">Margin: {v.revenue > 0 ? Math.round((v.margin / v.revenue) * 100) : 0}%</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Cash Flow Forecast */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ChartCard
          title="Projected In"
          subtitle="6-month incoming cash trend"
          empty={cashFlow.length === 0}
          emptyMessage="No forecast data."
          emptyIcon="trend"
        >
          <LineChart data={cashFlowTrend(cashFlow, "in")} color="var(--st-success)" showPoints />
        </ChartCard>
        <ChartCard
          title="Projected Out"
          subtitle="6-month outgoing cash trend"
          empty={cashFlow.length === 0}
          emptyMessage="No forecast data."
          emptyIcon="trend"
        >
          <LineChart data={cashFlowTrend(cashFlow, "out")} color="var(--st-warning)" showPoints />
        </ChartCard>
      </div>

      <Card padding="sm" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">6-Month Cash Flow Forecast</div>}>
        <DataTable dense columns={cashFlowColumns} rows={cashFlow} rowKey={r => r.period} emptyMessage="No forecast data." />
      </Card>

      {/* Project Table */}
      <Card padding="sm" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Projects ({projects.length})</div>}>
        <DataTable dense columns={projectColumns} rows={projects} rowKey={p => p.projectId} emptyMessage="No projects." />
      </Card>
    </div>
  );
}

/** Map a cash-flow forecast to a single line series ("in" | "out"). */
export function cashFlowTrend(cashFlow: CashFlowForecastRow[], side: "in" | "out"): ChartDatum[] {
  return cashFlow.map(r => ({ label: r.period, value: side === "in" ? r.projectedIn : r.projectedOut }));
}