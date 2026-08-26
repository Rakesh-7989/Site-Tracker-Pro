// SiteTrack Pro — Platform Billing & MRR admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { useFeatureWithQuota } from "@/auth/useFeatureWithQuota";
import { Badge, Button, Icon, StatCard, AccessDenied, Alert } from "@/components/ui/atoms";
import { DataTable } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarChart, type ChartDatum } from "@/components/ui/Charts";
import { buildCsv, downloadCsv, csvDateStamp, type CsvColumn } from "@/lib/genericCsv";
import { listOrgBillingRows, type OrgBillingRow } from "@/app/platformBillingQueries";
import { fmtMrr } from "@/features/admin/PlatformOrgsView";


import { getClient } from "@/lib/supabase";

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

export interface BillingSummary { active: number; trial: number; suspended: number; totalMRR: number; arr: number }

/** Active/trial/suspended counts + MRR/ARR rollups from the billing rows. */
export function billingSummary(rows: OrgBillingRow[]): BillingSummary {
  const acc: BillingSummary = { active: 0, trial: 0, suspended: 0, totalMRR: 0, arr: 0 };
  for (const o of rows) {
    if (o.status === "active") { acc.active += 1; acc.totalMRR += o.mrr || 0; }
    else if (o.status === "trial") acc.trial += 1;
    else if (o.status === "suspended") acc.suspended += 1;
  }
  acc.arr = acc.totalMRR * 12;
  return acc;
}

/** Canonical plan order for the MRR-by-plan chart. */
export const PLAN_ORDER: readonly string[] = ["basic", "pro", "business", "enterprise", "custom"];

/** MRR per plan for active orgs (zero-MRR plans dropped). */
export function billingByPlan(rows: OrgBillingRow[]): ChartDatum[] {
  const sums = new Map<string, number>();
  for (const o of rows) {
    if (o.status !== "active") continue;
    sums.set(o.plan, (sums.get(o.plan) ?? 0) + (o.mrr || 0));
  }
  return PLAN_ORDER
    .map(p => ({ label: p, value: sums.get(p) ?? 0 }))
    .filter(d => d.value > 0);
}

/** CSV column spec for the billing export (raw values; MRR in INR). */
export const BILLING_CSV_COLUMNS: ReadonlyArray<CsvColumn<keyof OrgBillingRow>> = [
  { key: "name", label: "Organization" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Status" },
  { key: "mrr", label: "MRR" },
];

export function PlatformBillingView(): JSX.Element {
  const [orgs, setOrgs] = useState<OrgBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { atQuota: crAtQuota, rollup: crRollup } = useFeatureWithQuota("crm", "crm_leads");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listOrgBillingRows(client);
    if (res.ok) setOrgs(res.data); else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onExport = useCallback(() => {
    const content = buildCsv(orgs as unknown as Array<Record<string, unknown>>, BILLING_CSV_COLUMNS);
    if (!content) return;
    downloadCsv(`platform-billing-${csvDateStamp()}.csv`, content);
  }, [orgs]);

  const can = useCan("platform:billing:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  const summary = billingSummary(orgs);
  const planData = billingByPlan(orgs);

  const columns = [
    { key: "name", header: "Organization", render: (o: OrgBillingRow) => (
      <span className="font-semibold text-fg-primary text-sm">{o.name}</span>
    )},
    { key: "plan", header: "Plan", render: (o: OrgBillingRow) => (
      <Badge tone="info" className="capitalize">{o.plan}</Badge>
    ), hideOnMobile: true },
    { key: "status", header: "Status", render: (o: OrgBillingRow) => (
      <Badge tone={o.status === "active" ? "success" : o.status === "trial" ? "warning" : "neutral"} className="capitalize">{o.status}</Badge>
    )},
    { key: "mrr", header: "MRR", render: (o: OrgBillingRow) => (
      <span className="text-sm text-fg-primary tabular-nums">{fmtMrr(o.mrr)}</span>
    ), hideOnMobile: true },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-fg-primary">Billing & MRR</h1>
          <p className="text-fg-tertiary text-sm mt-1">{summary.active} active, {summary.trial} trial</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Icon name="download" size={14} />} onClick={onExport} disabled={orgs.length === 0}>
          Export CSV
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      {/* Quota usage alerts */}
      {crRollup && (
        <div className="mt-3 p-3 rounded-xl border" style={{ borderColor: crAtQuota ? 'var(--st-error)' : 'var(--st-warning)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-fg-tertiary text-sm">CRM Leads Quota</span>
            <span className="font-medium">{crRollup.crm_leads.current ?? 0}/{crRollup.crm_leads.max ?? '—'}</span>
          </div>
          <div className="w-full bg-panel rounded-full h-2">
            <div
              className={`bg-accent rounded-full h-2 transition-colors duration-500 ${crAtQuota ? 'after:scale-x-full' : ''}`}
              style={{ width: crRollup.crm_leads.pct !== null ? crRollup.crm_leads.pct + '%' : '0%' }}
              title={crRollup.crm_leads.pct !== null ? `CRM Leads: ${crRollup.crm_leads.pct}% used` : ''}
            />
          </div>
          {crRollup.crm_leads.pct !== null && crRollup.crm_leads.pct >= 100 && (
            <span className="text-xxxs text-error mt-1 block">🚫 At capacity</span>
          )}
          {crRollup.crm_leads.pct !== null && crRollup.crm_leads.pct >= 90 && crRollup.crm_leads.pct < 100 && (
            <span className="text-xxxs text-error mt-1 block">⚠️ 90% used</span>
          )}
          {crRollup.crm_leads.pct !== null && crRollup.crm_leads.pct >= 80 && crRollup.crm_leads.pct < 90 && (
            <span className="text-xxxs text-warning mt-1 block">⚠️ 80% used</span>
          )}
        </div>
      )}

      {loading ? <BillingSkeleton /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="MRR" value={summary.totalMRR ? fmtMrr(summary.totalMRR) : "₹0"} sub={`${summary.active} active subs`} />
            <StatCard label="ARR" value={summary.arr ? fmtMrr(summary.arr) : "₹0"} sub="annualized" />
            <StatCard label="Active" value={summary.active} sub="paying orgs" />
            <StatCard label="Trial / Suspended" value={`${summary.trial} / ${summary.suspended}`} sub="non-paying" />
          </div>
          <ChartCard
            title="Revenue by plan"
            subtitle="Monthly MRR for active subscriptions"
            height={180}
            empty={planData.length === 0}
            emptyMessage="No active MRR yet"
          >
            <BarChart data={planData} formatValue={fmtMrr} />
          </ChartCard>
        </>
      )}

      {!loading && (
        <DataTable
          dense
          columns={columns}
          rows={orgs}
          rowKey={o => o.id}
          emptyMessage="No organizations yet."
          variant="card"
        />
      )}
    </div>
  );
}

function BillingSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" role="status" aria-label="Loading billing">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-xl border border-default p-4 space-y-3">
            <Skeleton decorative height={10} width="w-16" />
            <Skeleton decorative height={24} width="w-12" />
          </div>
        ))}
      </div>
      <div className="bg-panel rounded-xl border border-default p-4 space-y-3">
        <Skeleton decorative height={12} width="w-32" />
        <Skeleton decorative height={160} width="w-full" />
      </div>
    </div>
  );
}