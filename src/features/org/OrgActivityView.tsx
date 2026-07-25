// SiteTrack Pro — Org Activity / Audit (/audit). Read-only audit trail scoped
// to the active org (list_org_activity RPC, migration 77).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { listOrgActivity, type OrgActivityRow } from "@/app/orgAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink-900">Activity</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div>
        : rows.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-500"><Icon name="shield" size={22} className="mx-auto text-ink-300 mb-2" />No activity recorded yet.</Card>
        ) : (
          <Card className="divide-y divide-cream-100">
            {rows.map(r => (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <Badge tone={ACTION_TONE[r.action] ?? "neutral"}>{r.action || "·"}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink-800">
                    <span className="font-semibold">{r.actorName}</span>
                    {r.actorRole && <span className="text-ink-400"> ({r.actorRole})</span>}
                    {" "}<span className="text-ink-500">{r.resource}{r.resourceId ? ` #${r.resourceId.slice(0, 8)}` : ""}</span>
                  </div>
                  {r.message && <div className="text-[12px] text-ink-500 truncate">{r.message}</div>}
                </div>
                <div className="text-[11px] text-ink-400 flex-shrink-0 whitespace-nowrap">{fmtTs(r.ts)}</div>
              </div>
            ))}
          </Card>
        )}
    </div>
  );
}
