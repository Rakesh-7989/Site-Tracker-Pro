// SiteTrack Pro — org Analytics (/analytics). Cross-project rollups + charts
// from the org_analytics RPC (migration 86).

import { useCallback, useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { useOrgSwitcher } from "@/auth";
import { Card, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { fmtRupees } from "@/app/financeQueries";
import { getOrgAnalytics, toBars, type OrgAnalytics } from "@/app/analyticsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const PIE_COLORS = ["var(--st-success)", "var(--st-warning)", "var(--st-indigo)", "var(--st-error)"];
const STATUS_ORDER = ["active", "completed", "on_hold", "cancelled"];
const PROG_ORDER = ["pending", "in_progress", "completed"];

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return <Card className="p-4"><div className="text-2xl font-display font-bold text-ink-900">{value}</div><div className="text-xs text-ink-500 mt-0.5">{label}</div></Card>;
}

function ChartCard({ title, rows, color }: { title: string; rows: Array<{ name: string; value: number }>; color: string }): JSX.Element {
  const empty = rows.every(r => r.value === 0);
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold tracking-[0.14em] uppercase text-ink-400 mb-2">{title}</div>
      {empty ? <div className="h-40 grid place-items-center text-sm text-ink-400">No data yet</div> : (
        <div style={{ width: "100%", height: 160 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--st-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ fill: "var(--st-bg-elevated)" }} />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
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

  const pie = a ? toBars(a.projectsByStatus, STATUS_ORDER).filter(r => r.value > 0) : [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink-900">Analytics</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div> : !a ? <div className="text-sm text-ink-500">No data.</div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Projects" value={String(a.projectCount)} />
            <Stat label="Avg progress" value={`${a.avgProgress}%`} />
            <Stat label="Total budget" value={fmtRupees(a.totalBudget)} />
            <Stat label="Invoiced" value={fmtRupees(a.finance.invoiceTotal)} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-[0.14em] uppercase text-ink-400 mb-2">Projects by status</div>
              {pie.length === 0 ? <div className="h-40 grid place-items-center text-sm text-ink-400">No projects yet</div> : (
                <div style={{ width: "100%", height: 160 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2}>
                        {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-center mt-1">
                {pie.map((r, i) => <span key={r.name} className="text-[11px] text-ink-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{r.name} ({r.value})</span>)}
              </div>
            </Card>
            <ChartCard title="Milestones by status" rows={toBars(a.milestoneStatus, PROG_ORDER)} color="var(--st-warning)" />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <ChartCard title="Tasks by status" rows={toBars(a.taskStatus, PROG_ORDER)} color="var(--st-indigo)" />
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-[0.14em] uppercase text-ink-400 mb-3">Finance</div>
              <div className="space-y-2">
                {[["Purchase orders", a.finance.poTotal, "truck"], ["Invoices", a.finance.invoiceTotal, "doc"], ["RA bills", a.finance.raBillTotal, "wallet"]].map(([label, val, icon]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <span className="text-sm text-ink-600 flex items-center gap-2"><Icon name={icon as "truck"} size={14} className="text-ink-400" />{label as string}</span>
                    <span className="text-sm font-semibold text-ink-900">{fmtRupees(val as number)}</span>
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
