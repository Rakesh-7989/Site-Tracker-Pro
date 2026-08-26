// SiteTrack Pro — Cross-project Analytics Dashboard (v6 Phase 4).
// Org-wide executive view: KPI rollups, cash flow forecast, project health,
// top/at-risk projects, alerts. Gated by budget:view or revenue:view.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { Card, Badge, Spinner, Alert, Icon, Button } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { getExecDashboard, type ProjectKPIs, type ExecDashboard, type CashFlowForecastRow } from "@/app/crossAnalyticsQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const HEALTH_TONE: Record<"green" | "amber" | "red", "success" | "warning" | "neutral"> = {
  green: "success", amber: "warning", red: "neutral",
};
const HEALTH_LABEL: Record<"green" | "amber" | "red", string> = {
  green: "Healthy", amber: "Watch", red: "At Risk",
};
const TYPE_LABEL: Record<string, string> = {
  construction: "Construction", architecture: "Architecture", interior: "Interior",
  consultancy: "Consultancy", design: "Design", other: "Other",
};

export function CrossAnalyticsView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const ctx = { orgId: activeOrg?.orgId };
  const canViewBudget = useCan("budget:view", ctx);
  const canViewRevenue = useCan("revenue:view", ctx);
  const canView = canViewBudget || canViewRevenue;

  const [dashboard, setDashboard] = useState<ExecDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getExecDashboard(client, ctx.orgId ?? "", memberProjectScope(session));
    if (res.ok) setDashboard(res.data); else setError(res.error);
    setLoading(false);
  }, [ctx.orgId]);

  useEffect(() => { if (canView) void reload(); }, [canView, reload]);

  const { busy, run } = useAction(reload, setError);

  if (!canView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-fg-primary">Cross-Project Analytics</h2>
          <Badge tone="neutral">Requires budget:view or revenue:view</Badge>
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
  if (!dashboard) return <div className="text-center py-8 text-fg-tertiary">No data.</div>;

  const { kpis, cashFlow, topProjects, atRiskProjects, overdueInvoices, overdueRA, pendingApprovals } = dashboard;

  const statCards = [
    { label: "Projects", value: kpis.projectCount, tone: "info" as const },
    { label: "Revenue", value: fmtRupees(kpis.totalRevenue), tone: "success" as const },
    { label: "Cost", value: fmtRupees(kpis.totalCost), tone: "neutral" as const },
    { label: "Gross Margin", value: `${kpis.totalGrossMarginPct}% (₹${fmtRupees(kpis.totalGrossMargin)})`, tone: kpis.totalGrossMargin >= 0 ? "success" : "danger" as const },
    { label: "Cash In", value: fmtRupees(kpis.totalCashIn), tone: "success" as const },
    { label: "Cash Out", value: fmtRupees(kpis.totalCashOut), tone: "warning" as const },
    { label: "Net Cash Flow", value: fmtRupees(kpis.totalNetCashFlow), tone: kpis.totalNetCashFlow >= 0 ? "success" : "danger" as const },
    { label: "Health: Green/Amber/Red", value: `${kpis.byHealth.green}/${kpis.byHealth.amber}/${kpis.byHealth.red}`, tone: "info" as const },
  ];

  const alertCards = [
    { label: "Overdue Invoices", count: overdueInvoices, tone: overdueInvoices > 0 ? "danger" : "success" as "success" | "warning" | "danger" | "neutral", icon: "alert" as const },
    { label: "Overdue RA Bills", count: overdueRA, tone: overdueRA > 0 ? "danger" : "success" as "success" | "warning" | "danger" | "neutral", icon: "alert" as const },
    { label: "Pending Approvals", count: pendingApprovals, tone: pendingApprovals > 0 ? "warning" : "success" as "success" | "warning" | "danger" | "neutral", icon: "activity" as const },
  ];

  const cashFlowColumns: Column<CashFlowForecastRow>[] = [
    { key: "period", header: "Period", className: "font-mono text-sm", render: r => <span className="font-mono text-sm">{r.period}</span> },
    { key: "projectedIn", header: "Projected In", className: "text-right font-mono text-sm", render: r => <span className="text-success">+{fmtRupees(r.projectedIn)}</span> },
    { key: "projectedOut", header: "Projected Out", className: "text-right font-mono text-sm", render: r => <span className="text-warning">−{fmtRupees(r.projectedOut)}</span> },
    { key: "net", header: "Net", className: "text-right font-mono text-sm font-semibold", render: r => <span className={r.net >= 0 ? "text-success" : "text-danger"}>${r.net >= 0 ? "+" : ""}{fmtRupees(r.net)}</span> },
    { key: "cumulative", header: "Cumulative", className: "text-right font-mono text-sm", render: r => <span className={r.cumulative >= 0 ? "text-success" : "text-danger"}>${r.cumulative >= 0 ? "+" : ""}{fmtRupees(r.cumulative)}</span> },
  ];

  const projectColumns: Column<ProjectKPIs>[] = [
    { key: "projectName", header: "Project", className: "flex-1 min-w-0", render: r => <div className="truncate">{r.projectName} <Badge tone="info">{TYPE_LABEL[r.projectType ?? "other"]}</Badge></div> },
    { key: "health", header: "Health", className: "text-center", render: r => <Badge tone={HEALTH_TONE[r.health]}>{HEALTH_LABEL[r.health]}</Badge> },
    { key: "revenue", header: "Revenue", className: "text-right font-mono text-sm", render: r => fmtRupees(r.revenue) },
    { key: "cost", header: "Cost", className: "text-right font-mono text-sm", render: r => fmtRupees(r.cost) },
    { key: "margin", header: "Margin %", className: "text-right font-mono text-sm", render: r => <span className={r.grossMarginPct >= 0 ? "text-success" : "text-danger"}>{r.grossMarginPct}%</span> },
    { key: "netCashFlow", header: "Net Cash", className: "text-right font-mono text-sm", render: r => <span className={r.netCashFlow >= 0 ? "text-success" : "text-danger"}>${r.netCashFlow >= 0 ? "+" : ""}{fmtRupees(r.netCashFlow)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-lg font-bold text-fg-primary">Cross-Project Analytics</h2>
        <Button size="sm" onClick={() => void run("refresh", async () => { await reload(); return { ok: true }; })} disabled={busy === "refresh"}>
          {busy === "refresh" ? <Spinner size={14} /> : <><Icon name="refresh" size={14} className="mr-1" /> Refresh</>}
        </Button>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {alertCards.map(a => (
          <Card key={a.label} className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Icon name={a.icon} size={16} className={`text-${a.tone}`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">{a.label}</span>
            </div>
            <div className="text-2xl font-display font-bold text-fg-primary">{a.count}</div>
          </Card>
        ))}
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {statCards.map(s => (
          <Card key={s.label} className="p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">{s.label}</div>
            <div className="text-lg font-display font-bold text-fg-primary mt-0.5">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* By Type Breakdown */}
      <Card padding="sm" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">By Project Type</div>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(kpis.byType).map(([type, v]) => (
            <div key={type} className="p-2 bg-bg-secondary rounded">
              <div className="text-xs font-semibold text-fg-primary">{TYPE_LABEL[type] || type}</div>
              <div className="text-[11px] text-fg-secondary">{v.count} projects</div>
              <div className="text-sm font-mono text-fg-primary">{fmtRupees(v.revenue)}</div>
              <div className="text-[11px] text-fg-tertiary">Margin: {v.revenue > 0 ? Math.round((v.margin / v.revenue) * 100) : 0}%</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Cash Flow Forecast */}
      <Card padding="sm" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">6-Month Cash Flow Forecast</div>}>
        <DataTable dense columns={cashFlowColumns} rows={cashFlow} rowKey={r => r.period} emptyMessage="No forecast data." />
      </Card>

      {/* Top Projects by Revenue */}
      <Card padding="sm" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Top Projects by Revenue</div>}>
        <DataTable dense columns={projectColumns} rows={topProjects} rowKey={r => r.projectId} emptyMessage="No projects." />
      </Card>

      {/* At-Risk Projects */}
      {atRiskProjects.length > 0 && (
        <Card padding="sm" className="border-l-2 border-error" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-error">⚠ At-Risk Projects ({atRiskProjects.length})</div>}>
          <DataTable dense columns={projectColumns} rows={atRiskProjects} rowKey={r => r.projectId} emptyMessage="No at-risk projects." />
        </Card>
      )}
    </div>
  );
}