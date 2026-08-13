// SiteTrack Pro — v5 Phase B1: org-wide client approval analytics (/approval-analytics).
// Revision throughput + approval health across every member project: stat
// cards, an org approval-rate donut, and a per-project rollup table with
// drill-down into the drawing register (same gates as the Review tab).
//
// Gates: plan `client_approvals` via <PlanGate>, capability `drawing:approve`
// via <AccessDenied> (the people who run the approval loop). Nav/module: design.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getClient } from "@/lib/supabase";
import { PlanGate, useOrgSwitcher, useCan } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { Card, Spinner, Alert, AccessDenied, Badge, StatCard } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ChartCard } from "@/components/ui/ChartCard";
import { PieChart, ChartLegend, type ChartDatum } from "@/components/ui/Charts";
import {
  listOrgApprovalDrawings, approvalOrgRollup, APPROVAL_TONE,
  type ApprovalDrawing,
} from "@/app/approvalQueries";

const APPROVAL_LABEL: Record<string, string> = {
  not_requested: "Not requested", pending: "Pending review", approved: "Approved", rejected: "Rejected", locked: "Locked",
};

interface Row {
  id: string;
  projectId: string;
  projectName: string;
  type: string;
  revision: string;
  approvalStatus: ApprovalDrawing["approvalStatus"];
  changeNote: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

export function ApprovalAnalyticsView(): JSX.Element {
  return <PlanGate feature="client_approvals"><ApprovalAnalyticsInner /></PlanGate>;
}

function ApprovalAnalyticsInner(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const canView = useCan("drawing:approve", { orgId: activeOrg?.orgId });
  const navigate = useNavigate();

  const [drawings, setDrawings] = useState<ApprovalDrawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!activeOrg?.orgId) { setError("No active organization."); setLoading(false); return; }
    const scope = memberProjectScope(session);
    const res = await listOrgApprovalDrawings(client, activeOrg.orgId, scope.mode === "member" ? scope.projectIds : null);
    if (res.ok) {
      setDrawings(res.data.drawings);
      setNameOf(() => res.data.projectName);
      setTypeOf(() => res.data.projectType);
    } else setError(res.error);
    setLoading(false);
  }, [activeOrg?.orgId]);

  const [nameOf, setNameOf] = useState<(id: string) => string | null>(() => () => null);
  const [typeOf, setTypeOf] = useState<(id: string) => string | null>(() => () => null);

  useEffect(() => { void reload(); }, [reload]);

  const rollup = useMemo(() => approvalOrgRollup(drawings, nameOf, typeOf), [drawings, nameOf, typeOf]);

  const pieData = useMemo<ChartDatum[]>(() => {
    const buckets: Array<[string, string, number]> = [
      ["Pending review", "warning", rollup.pending],
      ["Approved", "success", rollup.approved],
      ["Rejected", "error", rollup.rejected],
      ["Locked", "neutral", rollup.locked],
    ];
    return buckets.filter(b => b[2] > 0).map(([label, color, value]) => ({ label, color, value }));
  }, [rollup]);

  const rows = useMemo<Row[]>(() => drawings.map(d => ({
    id: d.id,
    projectId: d.projectId,
    projectName: nameOf(d.projectId) ?? "—",
    type: typeOf(d.projectId) ?? "—",
    revision: d.revision,
    approvalStatus: d.approvalStatus,
    changeNote: d.changeNote,
    approvedByName: d.approvedByName,
    approvedAt: d.approvedAt,
  })), [drawings, nameOf, typeOf]);

  const columns: Column<Row>[] = [
    { key: "drawing", header: "Drawing", render: r => <span className="text-[13px] font-semibold text-fg-primary">{r.revision}</span> },
    { key: "project", header: "Project", render: r => (
      <button type="button" onClick={() => navigate(`/projects/${r.projectId}/drawing-review`)} className="text-left text-[13px] text-fg-primary hover:text-accent">{r.projectName}</button>
    ) },
    { key: "status", header: "Status", render: r => <Badge tone={APPROVAL_TONE[r.approvalStatus]}>{APPROVAL_LABEL[r.approvalStatus]}</Badge> },
    { key: "note", header: "Change note", hideOnMobile: true, render: r => <span className="text-[12px] text-fg-secondary">{r.changeNote || "—"}</span> },
    { key: "approver", header: "Approved", hideOnMobile: true, render: r => (
      <span className="text-[12px] text-fg-secondary">{(r.approvalStatus === "approved" || r.approvalStatus === "locked") ? `${r.approvedByName ?? "—"}` : "—"}</span>
    ) },
  ];

  if (!canView) return <AccessDenied message="You don't have permission to view approval analytics." />;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon="image" label="Revisions" value={rollup.totalRevisions} accent="orange" />
        <StatCard icon="refresh" label="Pending" value={rollup.pending} accent="blue" />
        <StatCard icon="check" label="Approved" value={rollup.approved} accent="emerald" />
        <StatCard icon="x" label="Rejected" value={rollup.rejected} accent="red" />
        <StatCard icon="lock" label="Locked" value={rollup.locked} accent="violet" />
        <StatCard icon="trend" label="Approval rate" value={Math.round(rollup.approvalRate * 100) + "%"} sub={`${rollup.projects.length} projects`} accent="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Approval mix" empty={pieData.length === 0} emptyMessage="No reviewed drawings yet." height={180}>
          <div className="flex items-center justify-center gap-4">
            <PieChart data={pieData} size={140} thickness={24} centerLabel={String(rollup.totalRevisions)} />
            <ChartLegend data={pieData} />
          </div>
        </ChartCard>

        <Card title={<h3 className="font-display text-sm font-bold text-fg-primary">By project</h3>} padding="md" className="xl:col-span-2">
          {rollup.projects.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-fg-tertiary">No drawings across your projects yet.</p>
          ) : (
            <div className="space-y-2">
              {rollup.projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}/drawing-review`)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-left hover:bg-elevated"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-fg-primary">{p.name}</p>
                    <p className="text-[11px] text-fg-tertiary">{p.type} · {p.analytics.totalRevisions} revisions</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="warning">{p.analytics.pending} pending</Badge>
                    <Badge tone="success">{p.analytics.approved} approved</Badge>
                    <Badge tone={p.analytics.approvalRate >= 0.7 ? "success" : p.analytics.approvalRate >= 0.4 ? "warning" : "danger"}>{Math.round(p.analytics.approvalRate * 100)}%</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={<h3 className="font-display text-sm font-bold text-fg-primary">Revision register</h3>}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          dense
          loading={loading}
          error={error}
          emptyMessage="No drawings yet."
          emptyIcon="image"
        />
      </Card>

      {loading && <div className="flex justify-center py-4"><Spinner size={18} /></div>}
    </div>
  );
}
