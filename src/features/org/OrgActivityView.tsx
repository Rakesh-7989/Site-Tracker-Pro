// SiteTrack Pro — Org Activity / Audit (/audit). Read-only audit trail scoped
// to the active org (list_org_activity RPC, migration 77).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Alert, AccessDenied } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { listOrgActivity, type OrgActivityRow } from "@/app/orgAdminQueries";

 
import { getClient } from "@/lib/supabase";
const fmtTs = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
const ACTION_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  CREATE: "success", APPROVE: "success", RELEASE: "success",
  UPDATE: "info", UPLOAD: "info", LOGIN: "neutral", EXPORT: "neutral", DELEGATE: "info",
  REJECT: "danger", DELETE: "danger", IMPERSONATE: "warning", PAYMENT: "warning",
};

export function OrgActivityView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("audit:read", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canView) return <AccessDenied message="Audit access requires org admin." />;
  return <OrgActivityInner orgId={activeOrg.orgId} />;
}

export function ActivityFeed({ rows, loading, error }: { rows: OrgActivityRow[]; loading: boolean; error: string | null }): JSX.Element {
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (loading) {
    return (
      <div role="status" aria-label="Loading activity" aria-busy="true" className="space-y-3">
        {[0, 1, 2, 3, 4].map(r => (
          <div key={r} className="bg-card rounded-2xl border border-default shadow-card p-3 flex items-start gap-3">
            <span className="flex-shrink-0 mt-0.5"><Skeleton decorative height={20} width="w-14" /></span>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton decorative height={12} width="w-2/3" />
              <Skeleton decorative height={12} width="w-1/3" />
            </div>
            <span className="flex-shrink-0 mt-1"><Skeleton decorative height={12} width="w-16" /></span>
          </div>
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState compact icon="shield" title="No activity recorded yet" />;
  }
  return (
    <Card className="divide-y divide-default">
      {rows.map(r => (
        <div key={r.id} className="p-3 flex items-start gap-3">
          <Badge tone={ACTION_TONE[r.action] ?? "neutral"}>{r.action || "·"}</Badge>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-fg-primary">
              <span className="font-semibold">{r.actorName}</span>
              {r.actorRole && <span className="text-fg-tertiary"> ({r.actorRole})</span>}
              {" "}<span className="text-fg-secondary">{r.resource}{r.resourceId ? ` #${r.resourceId.slice(0, 8)}` : ""}</span>
            </div>
            {r.message && <div className="text-[12px] text-fg-secondary truncate">{r.message}</div>}
          </div>
          <div className="text-[11px] text-fg-tertiary flex-shrink-0 whitespace-nowrap">{fmtTs(r.ts)}</div>
        </div>
      ))}
    </Card>
  );
}

function OrgActivityInner({ orgId }: { orgId: string }): JSX.Element {
  const [rows, setRows] = useState<OrgActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listOrgActivity(client, orgId, 100); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Activity</h1>
      <ActivityFeed rows={rows} loading={loading} error={error} />
    </div>
  );
}
