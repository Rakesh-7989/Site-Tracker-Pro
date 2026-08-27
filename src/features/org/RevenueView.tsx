// SiteTrack Pro — consultancy revenue report (v4 C2).
//
// Org-wide invoiced revenue split by source (phase / hourly / retainer) plus
// the monthly recurring value of active retainers. Light-weight like the
// Utilization view: one table, one fetch.
//
// Gates: capability `revenue:view` via <AccessDenied>. No plan gate — the
// billing engines themselves are plan-gated (rate_cards / retainer_billing /
// hourly_billing). Nav shows only for consultancy / architecture / multiple
// segment orgs (segments gate in nav-config).

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { useOrgSwitcher, useCan } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries/queries";
import { Card, Alert, AccessDenied } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ChartCard } from "@/components/ui/ChartCard";
import { ChartLegend, PieChart, type ChartDatum } from "@/components/ui/Charts";
import { Skeleton } from "@/components/ui/Skeleton";
import { fmtRupees, fmtCompactRupees } from "@/app/queries/financeQueries";
import { listProjectsByType, type ProjectBrief } from "@/app/queries/utilizationQueries";
import {
  listOrgInvoices, listOrgRetainers, billedToDate, billedBySource, retainerMrr,
  type OrgInvoiceRow,
} from "@/app/queries/billingQueries";
import type { Retainer } from "@/app/queries/retainerQueries";

export function RevenueView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const canView = useCan("revenue:view", { orgId: activeOrg?.orgId });

  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [invoices, setInvoices] = useState<OrgInvoiceRow[]>([]);
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!activeOrg?.orgId) { setError("No active organization."); setLoading(false); return; }
    const projectsRes = await listProjectsByType(client, activeOrg.orgId, undefined, memberProjectScope(session));
    if (!projectsRes.ok) { setError(projectsRes.error); setLoading(false); return; }
    const ids = projectsRes.data.map(p => p.id);
    const [invRes, retRes] = await Promise.all([listOrgInvoices(client, ids), listOrgRetainers(client, ids)]);
    if (!invRes.ok) { setError(invRes.error); setLoading(false); return; }
    if (!retRes.ok) { setError(retRes.error); setLoading(false); return; }
    setProjects(projectsRes.data);
    setInvoices(invRes.data);
    setRetainers(retRes.data);
    setLoading(false);
  }, [activeOrg?.orgId]);

  useEffect(() => { void reload(); }, [reload]);

  if (!canView) return <AccessDenied message="You don't have permission to view revenue." />;

  const totalBilled = billedToDate(invoices);
  const hourly = billedBySource(invoices, "hourly");
  const phase = billedBySource(invoices, "phase");
  const retainer = billedBySource(invoices, "retainer");
  const mrr = retainerMrr(retainers);
  const sourceData = sourceSplitData(phase, hourly, retainer);

  const rows = projects.map(p => {
    const pInv = invoices.filter(i => i.projectId === p.id && i.status !== "cancelled");
    const pRet = retainers.filter(r => r.projectId === p.id && r.status === "active");
    return {
      projectId: p.id, name: p.name, type: p.type,
      phase: pInv.filter(i => i.source === "phase").reduce((s, i) => s + i.amount, 0),
      hourly: pInv.filter(i => i.source === "hourly").reduce((s, i) => s + i.amount, 0),
      retainer: pInv.filter(i => i.source === "retainer").reduce((s, i) => s + i.amount, 0),
      mrr: pRet.reduce((s, r) => s + r.monthlyAmount, 0),
      total: pInv.reduce((s, i) => s + i.amount, 0),
    };
  });

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "name", header: "Project", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="font-display font-semibold text-fg-primary tracking-editorial text-sm">{r.name}</div>
          <div className="text-[11px] text-fg-secondary capitalize">{r.type}</div>
        </div>
      ),
    },
    {
      key: "phase", header: "Phase", hideOnMobile: true, className: "flex-shrink-0 text-right",
      render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.phase)}</span>,
    },
    {
      key: "hourly", header: "Hourly", hideOnMobile: true, className: "flex-shrink-0 text-right",
      render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.hourly)}</span>,
    },
    {
      key: "retainer", header: "Retainer", hideOnMobile: true, className: "flex-shrink-0 text-right",
      render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.retainer)}</span>,
    },
    {
      key: "mrr", header: "MRR", className: "flex-shrink-0 text-right",
      render: r => (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.mrr > 0 ? "bg-success-tint text-success" : "bg-bg-secondary text-fg-tertiary"}`}>
          {fmtRupees(r.mrr)}
        </span>
      ),
    },
    {
      key: "total", header: "Invoiced", className: "flex-shrink-0 text-right",
      render: r => <span className="text-sm font-mono">{fmtRupees(r.total)}</span>,
    },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Consultancy</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Revenue</h1>
        <p className="text-fg-secondary text-sm mt-2">Invoiced revenue across consultancy / design projects, split by source. MRR = sum of active monthly retainers.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Invoiced total</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(totalBilled)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Retainer MRR</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(mrr)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Hourly billed</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(hourly)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Phase billed</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(phase)}</div>
        </Card>
      </div>

      <ChartCard
        title="Invoiced by source"
        subtitle="Phase / hourly / retainer split of invoiced revenue"
        empty={totalBilled <= 0}
        emptyMessage="No invoiced revenue yet"
        className="mb-6"
        legend={<ChartLegend data={sourceData} />}
      >
        <PieChart data={sourceData} centerLabel={shortCurrency(totalBilled)} size={150} thickness={26} />
      </ChartCard>

      {loading ? (
        <div role="status" aria-label="Loading revenue" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton decorative height={14} width="w-1/3" />
                <Skeleton decorative height={12} width="w-1/4" />
              </div>
              <Skeleton decorative height={20} width="w-16" />
              <Skeleton decorative height={20} width="w-16" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-fg-secondary">
          No consultancy / design projects yet. Retainers and hourly / phase invoices on a project will appear here.
        </Card>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-default">
          <DataTable dense columns={columns} rows={rows} rowKey={r => r.projectId} />
        </div>
      )}
    </div>
  );
}

/** Source-split pie data, zero slices dropped (order: phase, hourly, retainer). */
export function sourceSplitData(phase: number, hourly: number, retainer: number): ChartDatum[] {
  const rows: ChartDatum[] = [];
  if (phase > 0) rows.push({ label: "Phase", value: phase });
  if (hourly > 0) rows.push({ label: "Hourly", value: hourly });
  if (retainer > 0) rows.push({ label: "Retainer", value: retainer });
  return rows;
}

/** Compact rupee label for tight pie-centre slots (alias of financeQueries). */
export const shortCurrency = fmtCompactRupees;
