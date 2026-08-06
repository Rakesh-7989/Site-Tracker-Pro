// SiteTrack Pro — cross-project FF&E rollup (v4 E3).
//
// Org-wide furniture/fixture/equipment budget across design/interior projects:
// committed (non-cancelled qty×unit_cost) vs procured, split by status and
// category, with a per-project table and delivery-progress bar. Mirrors the
// CrossProjectPOsView + RevenueView org-rollup pattern (project list once,
// rows grouped back by project). RLS read = project member, so it only
// surfaces projects the caller can already see.
//
// Gates: plan `ffe` via <PlanGate>, capability `ffe:manage` via <AccessDenied>.
// Nav shows only for architecture / interior / multiple segment orgs
// (segments gate in nav-config), module `design`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getClient } from "@/lib/supabase";
import { PlanGate, useOrgSwitcher, useCan } from "@/auth";
import { Card, Spinner, Alert, AccessDenied, ProgressBar } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { listOrgFfe, ffeOrgRollup, type FfeOrgRow, type FfeOrgProject } from "@/app/ffeQueries";

export function FfeRollupView(): JSX.Element {
  return <PlanGate feature="ffe"><FfeRollupInner /></PlanGate>;
}

function FfeRollupInner(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("ffe:manage", { orgId: activeOrg?.orgId });
  const navigate = useNavigate();

  const [projects, setProjects] = useState<FfeOrgProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!activeOrg?.orgId) { setError("No active organization."); setLoading(false); return; }
    const res = await listOrgFfe(client, activeOrg.orgId);
    if (res.ok) setProjects(res.data); else setError(res.error);
    setLoading(false);
  }, [activeOrg?.orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const rollup = useMemo(() => ffeOrgRollup(projects), [projects]);

  if (!canView) return <AccessDenied message="You don't have permission to view the FF&E rollup." />;

  const columns: Column<FfeOrgRow>[] = [
    {
      key: "name", header: "Project", className: "flex-1 min-w-0",
      render: r => (
        <div className="cursor-pointer hover:bg-elevated rounded p-1 -m-1 transition">
          <div className="font-display font-semibold text-fg-primary tracking-editorial text-sm">{r.name}</div>
          <div className="text-[11px] text-fg-secondary capitalize">{r.type ?? "—"}</div>
        </div>
      ),
    },
    { key: "count", header: "Entries", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{r.count}</span> },
    { key: "committed", header: "Committed", className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.committed)}</span> },
    { key: "procured", header: "Procured", className: "flex-shrink-0 text-right", render: r => <span className="text-sm font-mono">{fmtRupees(r.procured)}</span> },
    {
      key: "progress", header: "Progress", className: "flex-shrink-0",
      render: r => {
        const pct = r.committed > 0 ? Math.round((r.procured / r.committed) * 100) : 0;
        return (
          <div className="w-28">
            <ProgressBar value={pct} color={pct >= 100 ? "emerald" : "orange"} />
            <div className="text-[10px] text-fg-tertiary mt-1 text-right">{pct}%</div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Architecture · Procurement</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">FF&amp;E Rollup</h1>
        <p className="text-fg-secondary text-sm mt-2">Furniture, fixture &amp; equipment budget committed across design / interior projects, vs. what has actually been procured. Drill into a project to manage its schedule.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Projects</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.projects}</div>
          <div className="text-xs text-fg-tertiary mt-0.5">{rollup.entries} entries</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Committed budget</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(rollup.committed)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Procured</div>
          <div className="font-display text-2xl font-bold text-success mt-1">{fmtRupees(rollup.procured)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Procured %</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.committed > 0 ? Math.round((rollup.procured / rollup.committed) * 100) : 0}%</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary mb-3">By status</div>
          <div className="space-y-2">
            {rollup.byStatus.map(s => (
              <div key={s.key} className="flex items-center justify-between text-sm">
                <span className="text-fg-secondary">{s.label} <span className="text-fg-tertiary">· {s.count}</span></span>
                <span className="font-mono text-fg-primary">{fmtRupees(s.committed)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary mb-3">By category</div>
          <div className="space-y-2">
            {rollup.byCategory.map(c => (
              <div key={c.key} className="flex items-center justify-between text-sm">
                <span className="text-fg-secondary">{c.label} <span className="text-fg-tertiary">· {c.count}</span></span>
                <span className="font-mono text-fg-primary">{fmtRupees(c.committed)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : rollup.projects === 0 ? (
        <Card className="p-10 text-center text-sm text-fg-secondary">
          No design / interior projects with an FF&amp;E schedule yet. Entries added on a project's FF&amp;E tab will roll up here.
        </Card>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-default">
          <DataTable columns={columns} rows={rollup.byProject} rowKey={r => r.projectId}
            onRowClick={r => navigate(`/projects/${r.projectId}/ffe`)} />
        </div>
      )}
    </div>
  );
}