// SiteTrack Pro — B5 storage quota meter (P-H4).
// Reusable component: progress bar + used/total per bucket + over-quota warning.
// Wired into OrgDashboardView.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { storageByBucket, storagePercent, storageUsed, storageTotal, storageRemaining } from "@/app/queries/storageQuotaQueries";
import { Card, ProgressBar, Alert, Badge } from "@/components/ui/atoms";

const BUCKET_LABELS: Record<string, string> = {
  deliverables: "Deliverables",
  dpr_media: "DPR-media",
  research_docs: "Research-docs" };

export function QuotaMeter({ orgId }: { orgId: string }): JSX.Element {
  const [state, setState] = useState<{
    loading: boolean;
    data: import("@/app/queries/storageQuotaQueries").StorageByBucket[] | null;
    error: string | null;
  }>({ loading: true, data: null, error: null });

  const load = useCallback(async () => {
    setState({ loading: true, data: null, error: null });
    const client = await getClient();
    if (!client) {
      setState({ loading: false, data: null, error: "Backend not configured." });
      return;
    }
    const data = await storageByBucket(client, orgId);
    if (!data.ok) {
      setState({ loading: false, data: null, error: data.error ?? "Failed to load quota." });
      return;
    }
    setState({ loading: false, data: data.data ?? null, error: null });
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  if (state.loading) {
    return <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>;
  }

  if (state.error) {
    return <Alert variant="danger">{state.error}</Alert>;
  }

  const data = state.data!;
  const usedPct = storagePercent(data);
  const usedBytes = storageUsed(data);
  const remainingBytes = storageRemaining(data);
  const totalBytes = storageTotal(data);

  const formatBytes = (n: number): string => {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + " GB";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " MB";
    if (n >= 1_000) return Math.round(n / 1_000) + " KB";
    return n + " bytes";
  };

  const bucketRows = data.map((b: import("@/app/queries/storageQuotaQueries").StorageByBucket) => (
    <div key={b.bucket} className="space-y-2">
      <div className="flex justify-between text-sm mb-1">
        <span>{BUCKET_LABELS[b.bucket]}</span>
        <span className="font-mono text-fg-tertiary">
          {formatBytes(b.used_bytes)} / {formatBytes(b.total_bytes)}
        </span>
      </div>
      <ProgressBar value={b.used_pct} />
      <Badge tone={b.used_pct >= 90 ? "danger" : "neutral"}>
        {b.used_pct}% used
      </Badge>
    </div>
  ));

  return (
    <Card className="p-4 md:p-6">
      <h2 className="font-display text-lg font-bold text-fg-primary mb-4">Storage quota</h2>
      <p className="text-sm text-fg-secondary mb-4">
        Used <strong>{formatBytes(usedBytes)}</strong> of <strong>{formatBytes(totalBytes)}</strong>
        ({usedPct}% used, <strong>{formatBytes(remainingBytes)}</strong> remaining)
      </p>

      <div className="space-y-3">
        {bucketRows}
      </div>

      {usedPct >= 90 && (
        <Alert variant="danger">
          <p className="font-medium">You are approaching your storage limit.</p>
          <p className="text-xs text-fg-tertiary mt-1">
            Free space by removing unused deliverables / DPR media / research docs.
          </p>
        </Alert>
      )}
    </Card>
  );
}