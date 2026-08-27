// SiteTrack Pro — project-level utilization (v4 C1 drill-down).
//
// Fee-vs-effort variance for a single consultancy/design project, broken down
// per fee phase. A fixed-fee engagement has no hourly billing, so `billed
// value` is the team's logged billable hours × their rate snapshots — the
// effort actually burned against the agreed fee. Utilization % = billed value
// ÷ committed fee per phase.
//
// Gates: tab visibility via `utilization:view` + plan `utilization`
// (tabs-config.ts); this tab renders read-only.

import { useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { Card, Alert } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/queries/financeQueries";
import { getProjectUtilizationByPhase, type UtilizationPhaseRow } from "@/app/queries/utilizationQueries";

const UNASSIGNED_PHASE_ID = "__unassigned__";

export function UtilizationTab({ projectId }: { projectId: string }): JSX.Element {
  const [rows, setRows] = useState<UtilizationPhaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true); setError(null);
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const res = await getProjectUtilizationByPhase(client, projectId);
      if (!alive) return;
      if (res.ok) setRows(res.data); else setError(res.error ?? "Failed to load utilization.");
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [projectId]);

  if (loading) return (
    <div role="status" aria-label="Loading utilization" aria-busy="true" className="space-y-3 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card rounded-2xl border border-default p-4 space-y-2">
            <div className="h-6 bg-elevated rounded animate-pulse w-3/4" />
            <div className="h-4 bg-elevated rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
              <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
            </div>
            <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
          </div>
        ))}
      </div>
    </div>
  );
  if (error) return <Alert variant="danger">{error}</Alert>;

  if (rows.length === 0) return (
    <div className="text-center py-20 text-fg-secondary">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-elevated animate-pulse" />
      <p>No fee phases or billable time logged yet.</p>
    </div>
  );

  const fee = rows.reduce((s, r) => s + r.feeAmount, 0);
  const hours = rows.reduce((s, r) => s + r.loggedHours, 0);
  const value = rows.reduce((s, r) => s + r.billedValue, 0);
  const pct = fee > 0 ? Math.round((value / fee) * 100) : 0;
  const variance = fee - value; // positive = under budget, negative = over

  const columns: Column<UtilizationPhaseRow>[] = [
    {
      key: "phaseTitle", header: "Phase", className: "flex-1 min-w-0",
      render: r => (
        <div className="min-w-0">
          <div className="font-display font-semibold text-fg-primary tracking-editorial text-sm truncate">{r.phaseTitle}</div>
          {r.phaseId === UNASSIGNED_PHASE_ID && (
            <div className="text-[10px] text-warning">Billable hours without a phase</div>
          )}
        </div>
      ),
    },
    {
      key: "feeAmount", header: "Fee", className: "w-24",
      render: r => <span className="text-fg-primary font-medium tabular-nums">{fmtRupees(r.feeAmount)}</span>,
    },
    {
      key: "loggedHours", header: "Hours", className: "w-20 text-right",
      render: r => <span className="tabular-nums text-fg-secondary">{r.loggedHours.toFixed(1)}</span>,
    },
    {
      key: "billedValue", header: "Billed", className: "w-28",
      render: r => <span className="tabular-nums text-fg-secondary">{fmtRupees(r.billedValue)}</span>,
    },
    {
      key: "utilizationPct", header: "Util %", className: "w-28",
      render: r => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 min-w-0 rounded-full bg-bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full ${r.utilizationPct >= 100 ? "bg-warning" : r.utilizationPct >= 80 ? "bg-success" : "bg-accent"}`}
              style={{ width: `${Math.min(100, r.utilizationPct)}%` }}
            />
          </div>
          <span className="tabular-nums text-fg-secondary text-xs w-9 text-right">{r.utilizationPct}%</span>
        </div>
      ),
    },
  ];

  const varianceLabel = variance >= 0 ? "under budget" : "over budget";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Committed fee</div>
          <div className="font-display text-xl font-bold text-fg-primary tracking-editorial">{fmtRupees(fee)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Billable hours</div>
          <div className="font-display text-xl font-bold text-fg-primary tracking-editorial tabular-nums">{hours.toFixed(1)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Billed value</div>
          <div className="font-display text-xl font-bold text-fg-primary tracking-editorial">{fmtRupees(value)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Utilization</div>
          <div className={`font-display text-xl font-bold tracking-editorial ${pct >= 100 ? "text-warning" : "text-success"}`}>{pct}%</div>
          <div className="text-[10px] text-fg-tertiary">{fmtRupees(variance)} {varianceLabel}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <DataTable dense columns={columns} rows={rows} rowKey={r => r.phaseId} emptyMessage="No fee phases or billable time logged yet." />
      </Card>
    </div>
  );
}
