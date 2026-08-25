// SiteTrack Pro — org Analytics (/analytics). Cross-project rollups + charts
// from the org_analytics RPC (migration 86).

import { useCallback, useEffect, useState } from "react";
import { useOrgSwitcher } from "@/auth";
import { Card, Alert, Icon } from "@/components/ui/atoms";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarChart, ChartLegend, PieChart, type ChartDatum } from "@/components/ui/Charts";
import { Skeleton } from "@/components/ui/Skeleton";
import { fmtRupees } from "@/app/financeQueries";
import { getOrgAnalytics, toBars, type OrgAnalytics } from "@/app/analyticsQueries";

 
import { getClient } from "@/lib/supabase";
const STATUS_ORDER = ["active", "completed", "on_hold", "cancelled"];
const PROG_ORDER = ["pending", "in_progress", "completed"];

export function AnalyticsSkeleton(): JSX.Element {
  const chartCards = [0, 1].map(i => (
    <div key={i} className="bg-card rounded-2xl border border-default shadow-card p-4 space-y-2">
      <Skeleton decorative height={12} width="w-28" />
      <div className="grid place-items-center py-8">
        <Skeleton decorative height={80} width="w-40" />
      </div>
    </div>
  ));
  return (
    <div role="status" aria-label="Loading analytics" aria-busy="true" className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card rounded-2xl border border-default shadow-card p-4 space-y-2">
            <Skeleton decorative height={24} width="w-20" />
            <Skeleton decorative height={12} width="w-16" />
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{chartCards}</div>
      <div className="grid sm:grid-cols-2 gap-3">{chartCards}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return <Card className="p-4"><div className="text-2xl font-display font-bold text-fg-primary">{value}</div><div className="text-xs text-fg-secondary mt-0.5">{label}</div></Card>;
}

export function AnalyticsView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const [a, setA] = useState<OrgAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgAnalytics(client, orgId); if (res.ok) setA(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const pie = a ? toBars(a.projectsByStatus, STATUS_ORDER).filter(r => r.value > 0).map(r => ({ label: r.name, value: r.value })) : [];
  const milestoneBars = a ? toBars(a.milestoneStatus, PROG_ORDER).map(r => ({ label: r.name, value: r.value })) : [];
  const taskBars = a ? toBars(a.taskStatus, PROG_ORDER).map(r => ({ label: r.name, value: r.value })) : [];
  const barsEmpty = (rows: ChartDatum[]) => rows.every(r => r.value === 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="font-display text-2xl font-bold text-fg-primary">Analytics</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <AnalyticsSkeleton /> : !a ? <div className="text-sm text-fg-secondary">No data.</div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Projects" value={String(a.projectCount)} />
            <Stat label="Avg progress" value={`${a.avgProgress}%`} />
            <Stat label="Total budget" value={fmtRupees(a.totalBudget)} />
            <Stat label="Invoiced" value={fmtRupees(a.finance.invoiceTotal)} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <ChartCard
              title="Projects by status"
              height={160}
              empty={pie.length === 0}
              emptyMessage="No projects yet"
              legend={<ChartLegend data={pie} />}
            >
              <PieChart data={pie} centerLabel={String(pie.reduce((s, r) => s + r.value, 0))} />
            </ChartCard>
            <ChartCard title="Milestones by status" height={160} empty={barsEmpty(milestoneBars)} emptyMessage="No data yet">
              <BarChart data={milestoneBars} color="var(--st-warning)" />
            </ChartCard>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <ChartCard title="Tasks by status" height={160} empty={barsEmpty(taskBars)} emptyMessage="No data yet">
              <BarChart data={taskBars} color="var(--st-indigo)" />
            </ChartCard>
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-tertiary mb-3">Finance</div>
              <div className="space-y-2">
                {[["Purchase orders", a.finance.poTotal, "truck"], ["Invoices", a.finance.invoiceTotal, "doc"], ["RA bills", a.finance.raBillTotal, "wallet"]].map(([label, val, icon]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <span className="text-sm text-fg-secondary flex items-center gap-2"><Icon name={icon as "truck"} size={14} className="text-fg-tertiary" />{label as string}</span>
                    <span className="text-sm font-semibold text-fg-primary">{fmtRupees(val as number)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
