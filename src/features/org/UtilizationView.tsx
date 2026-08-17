// SiteTrack Pro — utilization report (v4 C1).
//
// Fee-vs-effort variance across the org's consultancy/design projects. A
// fixed-fee engagement has no hourly billing, so `billed value` is the team's
// logged billable hours × their rate snapshots — the effort actually burned
// against the agreed fee. Utilization % = billed value ÷ committed fee.
//
// Gates: plan `utilization` (Business+) via <PlanGate>, capability
// `utilization:view` via <AccessDenied>. Nav shows only for consultancy /
// architecture / multiple-segment orgs (segments gate in nav-config).

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { PlanGate, useOrgSwitcher, useCan } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { Card, Button, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarGroup, CHART_COLORS, type BarGroupSeries } from "@/components/ui/Charts";
import { fmtRupees, fmtCompactRupees } from "@/app/financeQueries";
import { getOrgUtilization, getProjectUtilizationByPhase, type UtilizationRow, type UtilizationPhaseRow } from "@/app/utilizationQueries";

export function UtilizationView(): JSX.Element {
  return <PlanGate feature="utilization"><UtilizationInner /></PlanGate>;
}

function UtilizationInner(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const canView = useCan("utilization:view", { orgId: activeOrg?.orgId });

  const [rows, setRows] = useState<UtilizationRow[]>([]);
  const [phases, setPhases] = useState<UtilizationPhaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [phaseLoading, setPhaseLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!activeOrg?.orgId) { setError("No active organization."); setLoading(false); return; }
    const res = await getOrgUtilization(client, activeOrg.orgId, memberProjectScope(session));
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [activeOrg?.orgId]);

  const reloadPhase = useCallback(async (projectId: string) => {
    setPhaseLoading(true);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setPhaseLoading(false); return; }
    const phaseRes = await getProjectUtilizationByPhase(client, projectId);
    if (phaseRes.ok) setPhases(phaseRes.data); else setError(phaseRes.error);
    setPhaseLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (!canView) return <AccessDenied message="You don't have permission to view utilization." />;

  const totalFee = rows.reduce((s, r) => s + r.fee, 0);
  const totalHours = rows.reduce((s, r) => s + r.loggedHours, 0);
  const totalValue = rows.reduce((s, r) => s + r.billedValue, 0);

  const columns: Column<UtilizationRow>[] = [
    {
      key: "name", header: "Project", className: "flex-1 min-w-0",
      render: r => (
        <div className="cursor-pointer hover:bg-elevated rounded p-1 -m-1 transition" onClick={() => {
          setSelectedProjectId(selectedProjectId === r.projectId ? null : r.projectId);
          if (selectedProjectId !== r.projectId) {
            reloadPhase(r.projectId);
          }
        }}>
          <div className="font-display font-semibold text-fg-primary tracking-editorial text-sm">{r.name}</div>
          <div className="text-[11px] text-fg-secondary capitalize">{r.type}</div>
          <div className="text-[10px] text-fg-tertiary mt-0.5">Click to drill down by phase</div>
        </div>
      ),
    },
    {
      key: "fee", header: "Fee", className: "flex-shrink-0 text-right",
      render: r => <span className="text-sm font-mono">{fmtRupees(r.fee)}</span>,
    },
    {
      key: "hours", header: "Logged h", hideOnMobile: true, className: "flex-shrink-0 text-right",
      render: r => <span className="text-xs text-fg-secondary">{r.loggedHours.toFixed(1)}</span>,
    },
    {
      key: "value", header: "Billed", hideOnMobile: true, className: "flex-shrink-0 text-right",
      render: r => <span className="text-xs text-fg-secondary">{fmtRupees(Math.round(r.billedValue))}</span>,
    },
    {
      key: "variance", header: "Variance", className: "flex-shrink-0 text-right",
      render: r => (
        <span className={`text-sm font-mono ${r.variance >= 0 ? "text-success" : "text-warning"}`}>
          {r.variance >= 0 ? "+" : ""}{fmtRupees(Math.round(r.variance))}
        </span>
      ),
    },
    {
      key: "util", header: "Util %", className: "flex-shrink-0",
      render: r => (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.utilizationPct > 100 ? "bg-warning-tint text-warning" : "bg-info-tint text-info"}`}>
          {r.utilizationPct}%
        </span>
      ),
    },
  ];

  const phaseColumns: Column<UtilizationPhaseRow>[] = [
    { key: "phaseTitle", header: "Phase", className: "flex-1 min-w-0", render: r => <div className={`font-medium ${r.phaseId === "__unassigned__" ? "italic text-fg-tertiary" : ""}`}>{r.phaseTitle}</div> },
    { key: "feeAmount", header: "Fee", className: "flex-shrink-0 text-right", render: r => <span className="text-sm font-mono">{r.phaseId === "__unassigned__" ? "—" : fmtRupees(r.feeAmount)}</span> },
    { key: "loggedHours", header: "Logged h", className: "flex-shrink-0 text-right", render: r => <span className="text-xs">{r.loggedHours.toFixed(1)}</span> },
    { key: "billedValue", header: "Billed", className: "flex-shrink-0 text-right", render: r => <span className="text-xs">{fmtRupees(Math.round(r.billedValue))}</span> },
    { key: "variance", header: "Variance", className: "flex-shrink-0 text-right", render: r => <span className={`text-sm font-mono ${r.variance >= 0 ? "text-success" : "text-warning"}`}>{r.variance >= 0 ? "+" : ""}{fmtRupees(Math.round(r.variance))}</span> },
    { key: "utilizationPct", header: "Util %", className: "flex-shrink-0", render: r => r.phaseId === "__unassigned__" ? <span className="text-xs text-fg-tertiary">—</span> : <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.utilizationPct > 100 ? "bg-warning-tint text-warning" : "bg-info-tint text-info"}`}>{r.utilizationPct}%</span> },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Consultancy</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Utilization</h1>
        <p className="text-fg-secondary text-sm mt-2">Committed fees vs. billed effort on fixed-fee engagements. Variance positive = fee covers effort; negative = burning past the fee.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Projects</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{rows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Committed fee</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(totalFee)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Billed effort</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(Math.round(totalValue))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Logged hours</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{totalHours.toFixed(1)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        <ChartCard
          title="Fee vs billed effort by project"
          empty={rows.length === 0}
          emptyMessage="No projects"
          legend={<GroupedLegend bars={utilizationBars(rows)} />}
        >
          <BarGroup {...utilizationBars(rows)} showValues formatValue={fmtCompactRupees} />
        </ChartCard>
        <ChartCard
          title="Utilization % by project"
          empty={rows.length === 0}
          emptyMessage="No projects"
        >
          <BarGroup {...utilizationPctData(rows)} showValues formatValue={v => `${v}%`} />
        </ChartCard>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-fg-secondary">
          No consultancy / design projects with fee phases yet. Time + phases logged on a project will appear here.
        </Card>
       ) : (
         <div className="space-y-6">
           <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-default">
              <DataTable dense columns={columns} rows={rows} rowKey={r => r.projectId} />
           </div>

{selectedProjectId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-fg-primary">Phase Utilization for selected project</h3>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedProjectId(null)}>Clear Selection</Button>
                </div>
                {phaseLoading ? (
                  <div className="grid place-items-center py-8"><Spinner size={20} /></div>
                ) : phases.length === 0 ? (
                  <Card className="p-6 text-center text-sm text-fg-secondary">No phases or billable time logged for this project.</Card>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <ChartCard
                        title="Phase fee vs billed effort"
                        empty={phases.length === 0}
                        emptyMessage="No phases"
                        legend={<GroupedLegend bars={phaseBars(phases)} />}
                      >
                        <BarGroup {...phaseBars(phases)} showValues formatValue={fmtCompactRupees} />
                      </ChartCard>
                      <ChartCard
                        title="Phase utilization %"
                        empty={phases.length === 0}
                        emptyMessage="No phases"
                      >
                        <BarGroup {...phasePctData(phases)} showValues formatValue={v => `${v}%`} />
                      </ChartCard>
                    </div>
                    <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-default">
                      <DataTable dense columns={phaseColumns} rows={phases} rowKey={r => `${r.projectId}-${r.phaseId}`} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
}

/** Org-rollup Fee-vs-Billed grouped series (one bar per series per project). */
export function utilizationBars(rows: UtilizationRow[]): { groups: string[]; series: BarGroupSeries[] } {
  return {
    groups: rows.map(r => r.name),
    series: [
      { name: "Fee", color: "var(--st-violet)", values: rows.map(r => r.fee) },
      { name: "Billed", color: "var(--st-accent)", values: rows.map(r => Math.round(r.billedValue)) },
    ],
  };
}

/** Org-rollup single-series utilization % bars. */
export function utilizationPctData(rows: UtilizationRow[]): { groups: string[]; series: BarGroupSeries[] } {
  return {
    groups: rows.map(r => r.name),
    series: [{ name: "Util", color: "var(--st-warning)", values: rows.map(r => r.utilizationPct) }],
  };
}

/** Per-phase Fee-vs-Billed grouped series (one bar per series per phase). */
export function phaseBars(phases: UtilizationPhaseRow[]): { groups: string[]; series: BarGroupSeries[] } {
  return {
    groups: phases.map(r => r.phaseTitle),
    series: [
      { name: "Fee", color: "var(--st-violet)", values: phases.map(r => r.feeAmount) },
      { name: "Billed", color: "var(--st-accent)", values: phases.map(r => Math.round(r.billedValue)) },
    ],
  };
}

/** Per-phase single-series utilization % bars. */
export function phasePctData(phases: UtilizationPhaseRow[]): { groups: string[]; series: BarGroupSeries[] } {
  return {
    groups: phases.map(r => r.phaseTitle),
    series: [{ name: "Util", color: "var(--st-warning)", values: phases.map(r => r.utilizationPct) }],
  };
}

/** Small legend row for a grouped bar chart (swatch + series name). */
export function GroupedLegend({ bars }: { bars: { groups: string[]; series: BarGroupSeries[] } }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {bars.series.map((s, i) => (
        <span key={i} className="text-[11px] text-fg-secondary flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}
