import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import {
  useAuth,
  useCanWithPlan,
  useOrgSwitcher,
  type OrgCustomRole } from "@/auth";
import { Button, Alert, AccessDenied } from "@/components/ui/atoms";
import type { RoleOccupant } from "./RoleCard";
import {
  listOrgMembers,
  deactivateMember,
  reactivateMember,
  type OrgMemberRow } from "@/app/queries/orgMemberQueries";
import { listOrgRoles } from "@/app/queries/customRoleQueries";
import { RoleGrid } from "./RoleGrid";
import { MemberTableView } from "./MemberTableView";
import { AssignMemberModal } from "./AssignMemberModal";
import { ManageCustomRolesModal } from "./ManageCustomRolesModal";
import { InviteMemberModal } from "./InviteMemberModal";

type ViewMode = "grid" | "list";

export function OrgMembersView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const { allowed: canManage, plan, planLoading } = useCanWithPlan({
    capability: "org:members:manage",
    context: activeOrg ? { orgId: activeOrg.orgId } : {} });

  if (!session) return (
    <div role="status" aria-label="Loading" aria-busy="true" className="space-y-4 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card rounded-2xl border border-default p-4 space-y-2">
            <div className="h-6 bg-elevated rounded animate-pulse w-3/4" />
            <div className="h-4 bg-elevated rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
      <div className="h-40 bg-elevated rounded-2xl animate-pulse" />
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-elevated rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  // SEC-05: plan caps still resolving → hold the spinner, don't flash AccessDenied.
  if (planLoading) return (
    <div role="status" aria-label="Loading" aria-busy="true" className="space-y-4 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card rounded-2xl border border-default p-4 space-y-2">
            <div className="h-6 bg-elevated rounded animate-pulse w-3/4" />
            <div className="h-4 bg-elevated rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
      <div className="h-40 bg-elevated rounded-2xl animate-pulse" />
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-elevated rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
  if (!canManage) return <AccessDenied message="Only an org admin can manage people." />;

  return (
    <OrgMembersInner
      orgId={activeOrg.orgId}
      orgName={activeOrg.orgName}
      createdBy={session.user.id}
      plan={plan}
    />
  );
}

function OrgMembersInner({
  orgId,
  orgName,
  createdBy,
  plan }: {
  orgId: string;
  orgName: string;
  createdBy: string;
  plan: string | null;
}): JSX.Element {
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [customRoles, setCustomRoles] = useState<OrgCustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [assignRole, setAssignRole] = useState<string | null>(null);
  const [manageRolesFor, setManageRolesFor] = useState<{ occupant: RoleOccupant } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = await getClient();
    if (!client) {
      setError("Backend not configured.");
      setLoading(false);
      return;
    }
    const [m, r] = await Promise.all([
      listOrgMembers(client, orgId),
      listOrgRoles(client, orgId),
    ]);
    if (m.ok) setMembers(m.data);
    else setError(m.error);
    if (r.ok) setCustomRoles(r.data);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAssign = useCallback((identityRole: string) => {
    setAssignRole(identityRole);
  }, []);

  const handleChange = useCallback((_identityRole: string, _occupant: RoleOccupant) => {
    // Future: "Change occupant" modal
  }, []);

  const handleDeactivate = useCallback(async (occupant: RoleOccupant) => {
    if (!occupant.active) return;
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await deactivateMember(client, orgId, occupant.profileId);
    if (!res.ok) setError(res.error);
    await reload();
  }, [orgId, reload]);

  const handleReactivate = useCallback(async (occupant: RoleOccupant) => {
    if (occupant.active) return;
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await reactivateMember(client, orgId, occupant.profileId);
    if (!res.ok) setError(res.error);
    await reload();
  }, [orgId, reload]);

  const handleManageCustomRoles = useCallback((occupant: RoleOccupant) => {
    setManageRolesFor({ occupant });
  }, []);

  const activeCount = members.filter(m => m.active).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">People</h1>
          <p className="text-sm text-fg-secondary mt-1">
            {orgName} &middot; {activeCount} active member{activeCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={viewMode === "grid" ? "primary" : "secondary"}
            onClick={() => setViewMode("grid")}
            leftIcon="dashboard"
          >
            Role Grid
          </Button>
          <Button
            size="sm"
            variant={viewMode === "list" ? "primary" : "secondary"}
            onClick={() => setViewMode("list")}
            leftIcon="users"
          >
            List
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            Invite Member
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
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
        </div>
      ) : viewMode === "grid" ? (
        <RoleGrid
          members={members}
          plan={plan}
          onAssign={handleAssign}
          onChange={handleChange}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onManageCustomRoles={handleManageCustomRoles}
        />
      ) : (
        <MemberTableView
          members={members}
          customRoles={customRoles}
          orgId={orgId}
          plan={plan}
          createdBy={createdBy}
          onReload={() => void reload()}
          onError={setError}
        />
      )}

      <AssignMemberModal
        open={assignRole !== null}
        onClose={() => setAssignRole(null)}
        orgId={orgId}
        orgName={orgName}
        identityRole={assignRole ?? ""}
        plan={plan}
        onAssigned={() => void reload()}
      />

      <ManageCustomRolesModal
        open={manageRolesFor !== null}
        onClose={() => setManageRolesFor(null)}
        profileId={manageRolesFor?.occupant.profileId ?? ""}
        memberName={manageRolesFor?.occupant.name ?? ""}
        orgId={orgId}
        createdBy={createdBy}
        customRoles={customRoles}
        assignedRoleLabels={manageRolesFor ? members.find(m => m.profileId === manageRolesFor.occupant.profileId)?.customRoles ?? [] : []}
        onReload={() => void reload()}
        onError={setError}
      />

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        orgId={orgId}
        orgName={orgName}
        onInvited={reload}
      />
    </div>
  );
}
