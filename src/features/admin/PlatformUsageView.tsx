// SiteTrack Pro — Platform Usage Analytics admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { useFeatureWithQuota } from "@/auth/useFeatureWithQuota";
import { Button, Icon, StatCard, AccessDenied, Alert } from "@/components/ui/atoms";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarChart, type ChartDatum } from "@/components/ui/Charts";
import { buildCsv, downloadCsv, csvDateStamp, type CsvColumn } from "@/lib/genericCsv";
import { getUsageStats, listUsagePlanCounts, type UsageStats, type PlanCount } from "@/app/platformUsageQueries";


import { getClient } from "@/lib/supabase";

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

/** Canonical plan order for the usage plan-mix chart. */
export const USAGE_PLAN_ORDER: readonly string[] = ["basic", "pro", "business", "enterprise", "custom"];

/** Org headcount per plan (zero-count plans dropped). */
export function usagePlanMix(counts: PlanCount[]): ChartDatum[] {
  const map = new Map(counts.map(c => [c.plan, c.count]));
  return USAGE_PLAN_ORDER
    .map(p => ({ label: p, value: map.get(p) ?? 0 }))
    .filter(d => d.value > 0);
}

/** CSV column spec for the usage export (raw values). */
export const USAGE_CSV_COLUMNS: ReadonlyArray<CsvColumn<keyof PlanCount>> = [
  { key: "plan", label: "Plan" },
  { key: "count", label: "Organizations" },
];

export function PlatformUsageView(): JSX.Element {
  const can = useCan("platform:usage:view");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  const [stats, setStats] = useState<UsageStats | null>(null);
  const [counts, setCounts] = useState<PlanCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { atQuota: crAtQuota, rollup: crRollup } = useFeatureWithQuota("crm", "crm_leads");
  const { atQuota: ffeAtQuota, rollup: ffeRollup } = useFeatureWithQuota("crm", "storage");
  const { atQuota: storageAtQuota, rollup: storageRollup } = useFeatureWithQuota("crm", "deliverables");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [sr, cr] = await Promise.all([getUsageStats(client), listUsagePlanCounts(client)]);
    if (sr.ok) setStats(sr.data); else setError(sr.error);
    if (cr.ok) setCounts(cr.data); else if (!sr.ok) setError(cr.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const planData = usagePlanMix(counts);
  const onExport = useCallback(() => {
    const content = buildCsv(counts as unknown as Array<Record<string, unknown>>, USAGE_CSV_COLUMNS);
    if (!content) return;
    downloadCsv(`platform-usage-${csvDateStamp()}.csv`, content);
  }, [counts]);

  if (loading) return <UsageSkeleton />;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-fg-primary mb-1">Usage Analytics</h1>
          <p className="text-fg-tertiary text-sm">Aggregate platform metrics</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Icon name="download" size={14} />} onClick={onExport} disabled={counts.length === 0}>
          Export CSV
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Organizations" value={stats?.orgs ?? "—"} sub="registered orgs" />
        <StatCard label="Users" value={stats?.users ?? "—"} sub="active members" />
        <StatCard label="Projects" value={stats?.projects ?? "—"} sub="across orgs" />
        <StatCard label="DAU / WAU / MAU" value="—" sub="build after go-live" />
      </div>

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
      {ffeRollup && (
        <div className="mt-3 p-3 rounded-xl border" style={{ borderColor: ffeAtQuota ? 'var(--st-error)' : 'var(--st-warning)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-fg-tertiary text-sm">Storage Quota</span>
            <span className="font-medium">{ffeRollup.storage.current ?? 0}/{ffeRollup.storage.max ?? '—'} GB</span>
          </div>
          <div className="w-full bg-panel rounded-full h-2">
            <div
              className={`bg-accent rounded-full h-2 transition-colors duration-500 ${ffeAtQuota ? 'after:scale-x-full' : ''}`}
              style={{ width: ffeRollup.storage.pct !== null ? ffeRollup.storage.pct + '%' : '0%' }}
              title={ffeRollup.storage.pct !== null ? `Storage: ${ffeRollup.storage.pct}% used` : ''}
            />
          </div>
          {ffeRollup.storage.pct !== null && ffeRollup.storage.pct >= 100 && (
            <span className="text-xxxs text-error mt-1 block">🚫 At capacity</span>
          )}
          {ffeRollup.storage.pct !== null && ffeRollup.storage.pct >= 90 && ffeRollup.storage.pct < 100 && (
            <span className="text-xxxs text-error mt-1 block">⚠️ 90% used</span>
          )}
          {ffeRollup.storage.pct !== null && ffeRollup.storage.pct >= 80 && ffeRollup.storage.pct < 90 && (
            <span className="text-xxxs text-warning mt-1 block">⚠️ 80% used</span>
          )}
        </div>
      )}
      {storageRollup && (
        <div className="mt-3 p-3 rounded-xl border" style={{ borderColor: storageAtQuota ? 'var(--st-error)' : 'var(--st-warning)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-fg-tertiary text-sm">Deliverables Quota</span>
            <span className="font-medium">{storageRollup.deliverables.current ?? 0}/{storageRollup.deliverables.max ?? '—'}</span>
          </div>
          <div className="w-full bg-panel rounded-full h-2">
            <div
              className={`bg-accent rounded-full h-2 transition-colors duration-500 ${storageAtQuota ? 'after:scale-x-full' : ''}`}
              style={{ width: storageRollup.deliverables.pct !== null ? storageRollup.deliverables.pct + '%' : '0%' }}
              title={storageRollup.deliverables.pct !== null ? `Deliverables: ${storageRollup.deliverables.pct}% used` : ''}
            />
          </div>
          {storageRollup.deliverables.pct !== null && storageRollup.deliverables.pct >= 100 && (
            <span className="text-xxxs text-error mt-1 block">🚫 At capacity</span>
          )}
          {storageRollup.deliverables.pct !== null && storageRollup.deliverables.pct >= 90 && storageRollup.deliverables.pct < 100 && (
            <span className="text-xxxs text-error mt-1 block">⚠️ 90% used</span>
          )}
          {storageRollup.deliverables.pct !== null && storageRollup.deliverables.pct >= 80 && storageRollup.deliverables.pct < 90 && (
            <span className="text-xxxs text-warning mt-1 block">⚠️ 80% used</span>
          )}
        </div>
      )}

      <ChartCard
        title="Organizations by plan"
        subtitle="How orgs are distributed across plans"
        height={180}
        empty={planData.length === 0}
        emptyMessage="No organizations yet"
      >
        <BarChart data={planData} showValues />
      </ChartCard>

      <div className="bg-warning-tint rounded-2xl p-4 border-l-4 border-accent text-sm text-warning">
        DAU/WAU/MAU counters require a materialized view on activity_log, refreshed by cron. Build after backend go-live.
      </div>
    </div>
  );
}

function UsageSkeleton(): JSX.Element {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4" role="status" aria-label="Loading usage analytics">
      <div className="space-y-2">
        <Skeleton decorative height={28} width="w-48" />
        <Skeleton decorative height={12} width="w-32" />
      </div>
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