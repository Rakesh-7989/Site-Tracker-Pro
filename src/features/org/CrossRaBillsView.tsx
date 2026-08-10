// SiteTrack Pro — cross-project RA bills view (v4 Phase D backlog close-out).
//
// Org-wide register of running-account bills across member projects: billed
// vs net-payable (after retention) vs settled, split by status, with a
// per-bill table (bill + project). Mirrors CrossProjectPOsView / RevenueView.
//
// Gate: `rabill:create` (matches the existing nav gate). Nav shows for all
// orgs under the Procurement group (finance module).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrgSwitcher, useCan } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { Card, Spinner, Badge, Alert, AccessDenied } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { getOrgRaBills, crossRaRollup, type CrossRaBill, type CrossRaTotals } from "@/app/crossRaQueries";

import { getClient } from "@/lib/supabase";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];
const TONE = { submitted: "warning", approved: "info", paid: "success", rejected: "danger" } as const;

export function CrossRaBillsView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const can = useCan("rabill:create", { orgId: activeOrg?.orgId });
  if (!can) return <AccessDenied message="You don't have permission to view RA bills." />;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const navigate = useNavigate();
  const session = useSession();
  const [rows, setRows] = useState<CrossRaBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgRaBills(client, orgId, memberProjectScope(session)); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const totals: CrossRaTotals = useMemo(() => crossRaRollup(rows), [rows]);
  const shown = filter === "all" ? rows : rows.filter(r => r.status === filter);

  const columns = [
    {
      key: "bill", header: "RA Bill", className: "flex-1 min-w-0",
      render: (r: CrossRaBill) => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{r.no} · {fmtRupees(r.billAmount)}</div>
          <div className="text-[11px] text-fg-tertiary truncate">{r.subcontractor ?? "—"} · net {fmtRupees(r.netPayable)} ({r.retentionPct}% ret)</div>
        </div>
      ),
    },
    {
      key: "project", header: "Project", hideOnMobile: true, className: "flex-shrink-0",
      render: (r: CrossRaBill) => (
        <div>
          <div className="text-sm text-fg-primary truncate">{r.projectName}</div>
          {r.projectType ? <div className="text-[10px] text-fg-tertiary capitalize">{r.projectType}</div> : null}
        </div>
      ),
    },
    {
      key: "scope", header: "Scope", hideOnMobile: true, className: "flex-1 min-w-0",
      render: (r: CrossRaBill) => <span className="text-xs text-fg-secondary truncate">{r.scope ?? "—"}</span>,
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: (r: CrossRaBill) => <Badge tone={TONE[r.status]}>{r.status}</Badge>,
    },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Finance</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">RA Bills</h1>
        <p className="text-fg-secondary text-sm mt-2">Running-account bills across the org's projects — billed value, net payable after retention, and settlement by status.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex justify-end mb-6">
        <Select className="w-44" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Bills</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{totals.count}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Billed</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(totals.billed)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Net Payable</div><div className="font-display text-2xl font-bold text-warning mt-1">{fmtRupees(totals.netPayable)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Paid Out</div><div className="font-display text-2xl font-bold text-success mt-1">{fmtRupees(totals.paid)}</div></Card>
        <Card className="p-4 flex flex-col justify-center">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Status Split</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(Object.keys(TONE) as Array<keyof typeof TONE>).map(s => (
              <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-elevated text-fg-secondary" title={`${s}: ${fmtRupees(totals.byStatus[s] as number)}`}>
                {s} · {fmtRupees(totals.byStatus[s] as number)}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-border">
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={r => r.id}
            variant="card"
            emptyMessage={filter === "all" ? "No RA bills found across projects." : `No ${filter} RA bills.`}
            onRowClick={r => navigate(`/projects/${r.projectId}/rabills`)}
          />
        </div>
      )}
    </div>
  );
}