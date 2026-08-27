// SiteTrack Pro — project Team tab.
//
// Lists active project members with their per-project role. Org admins
// can add members and approve/reject access requests.

import { useState, useEffect, useCallback } from "react";
import { useOrgSwitcher, useCan, ROLE_LABEL } from "@/auth";
import { Card, Avatar, Badge, Icon, Button, Spinner, Alert } from "@/components/ui/atoms";
import type { ProjectMemberRow } from "@/app/queries/queries";
import type { IdentityRole } from "@/auth";
import { getClient } from "@/lib/supabase/supabase";
import {
  listPendingRequests,
  approveRequest,
  rejectRequest,
  type PendingAccessRequest,
} from "@/app/queries/projectMemberQueries";
import { AddProjectMemberModal } from "../AddProjectMemberModal";

export function TeamTab({ projectId, orgId, members, onReload }: {
  projectId: string;
  orgId: string;
  members: ProjectMemberRow[];
  onReload: () => void;
}): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("team:manage", { orgId: activeOrg?.orgId, projectId });
  const [showAdd, setShowAdd] = useState(false);
  const [pending, setPending] = useState<PendingAccessRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendError, setPendError] = useState<string | null>(null);

  const reloadPending = useCallback(async () => {
    if (!canManage) return;
    setPendError(null);
    const client = await getClient();
    if (!client) return;
    const res = await listPendingRequests(client, projectId);
    if (res.ok) setPending(res.data);
    else setPendError(res.error);
  }, [projectId, canManage]);

  useEffect(() => { void reloadPending(); }, [reloadPending]);

  const handleApprove = async (reqId: string) => {
    setBusyId(reqId);
    const client = await getClient();
    if (!client) { setBusyId(null); return; }
    await approveRequest(client, reqId);
    setBusyId(null);
    void reloadPending();
    onReload();
  };

  const handleReject = async (reqId: string) => {
    setBusyId(reqId);
    const client = await getClient();
    if (!client) { setBusyId(null); return; }
    await rejectRequest(client, reqId);
    setBusyId(null);
    void reloadPending();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Team</h2>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={13} /> Add member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <Card className="p-8 text-center text-sm text-fg-secondary">No members assigned yet.</Card>
      ) : (
        <Card className="divide-y divide-default">
          {members.map(m => (
            <div key={m.profileId} className="flex items-center gap-3 p-3">
              <Avatar initials={m.name} size="sm" role={m.role} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-fg-primary truncate">{m.name}</div>
                {m.assignedAt && <div className="text-[11px] text-fg-tertiary">since {m.assignedAt.slice(0, 10)}</div>}
              </div>
              <Badge tone="neutral">{ROLE_LABEL[m.role as IdentityRole] ?? m.role}</Badge>
            </div>
          ))}
        </Card>
      )}

      {canManage && pending.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-secondary mb-2">
            Pending access requests ({pending.length})
          </h3>
          {pendError && <Alert variant="danger">{pendError}</Alert>}
          <Card className="divide-y divide-default">
            {pending.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-semibold text-fg-primary">{r.requesterName}</div>
                  <div className="text-[11px] text-fg-tertiary">{r.requesterRole} · {r.createdAt.slice(0, 10)}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void handleApprove(r.id)} disabled={busyId === r.id}>
                    {busyId === r.id ? <Spinner size={12} /> : null}
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="text-error" onClick={() => void handleReject(r.id)} disabled={busyId === r.id}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {showAdd && (
        <AddProjectMemberModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          projectId={projectId}
          orgId={orgId}
          currentMemberIds={members.map(m => m.profileId)}
          onAdded={() => { onReload(); void reloadPending(); }}
        />
      )}
    </div>
  );
}
