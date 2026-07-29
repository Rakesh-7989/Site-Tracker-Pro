// SiteTrack Pro � project Approvals tab (v3 port). A cross-entity "pending
// sign-off" queue: change orders, RA bills and POs awaiting approval. Each row
// is decided only by the matching approver capability.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { fmtRupees } from "@/app/financeQueries";
import { listPendingApprovals, decideApproval, type PendingApproval, type ApprovalKind } from "@/app/approvalsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const KIND_LABEL: Record<ApprovalKind, string> = { changeorder: "Change order", rabill: "RA bill", po: "Purchase order" };
const KIND_TONE: Record<ApprovalKind, "info" | "warning" | "neutral"> = { changeorder: "info", rabill: "warning", po: "neutral" };

export function ApprovalsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canApproveCo = useCan("changeorder:approve", ctx);
  const canApproveRa = useCan("rabill:approve", ctx);
  const canApprovePo = useCan("po:approve", ctx);
  const [rows, setRows] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPendingApprovals(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const decide = useCallback(async (r: PendingApproval, decision: "approved" | "rejected") => {
    setBusy(`${r.kind}-${r.id}`); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await decideApproval(client, r.kind, r.id, decision); if (!res.ok) setError(res.error); await reload(); setBusy(null);
  }, [reload]);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Pending approvals</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? (
          <Card className="p-6 text-center text-sm text-fg-secondary"><Icon name="check" size={22} className="mx-auto text-success mb-2" />Nothing awaiting sign-off. ??</Card>
        ) : <div className="space-y-2">{rows.map(r => { const k = `${r.kind}-${r.id}`; const canApprove = r.kind === "changeorder" ? canApproveCo : r.kind === "rabill" ? canApproveRa : canApprovePo; return (
            <Card key={k} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <Badge tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Badge>
                <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.ref} � {r.title}</div>
                  {r.amount != null && <div className="text-[11px] text-fg-secondary">{fmtRupees(r.amount)}</div>}</div>
              </div>
              {canApprove ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => void decide(r, "rejected")} disabled={busy === k}>Reject</Button>
                  <Button size="sm" onClick={() => void decide(r, "approved")} disabled={busy === k}>{busy === k ? <Spinner size={14} /> : "Approve"}</Button>
                </div>
              ) : <span className="text-xs text-fg-tertiary flex-shrink-0">awaiting approver</span>}
            </Card>
          ); })}</div>}
    </div>
  );
}
