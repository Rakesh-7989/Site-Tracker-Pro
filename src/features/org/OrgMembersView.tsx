import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import {
  useAuth,
  useCanWithPlan,
  useOrgSwitcher,
  type OrgCustomRole,
} from "@/auth";
import { Button, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import {
  listOrgMembers,
  deactivateMember,
  reactivateMember,
  type OrgMemberRow,
} from "@/app/orgMemberQueries";
import { listOrgRoles } from "@/app/customRoleQueries";
import { RoleGrid } from "./RoleGrid";
import type { RoleOccupant } from "./RoleCard";
import { MemberTableView } from "./MemberTableView";
import { AssignMemberModal } from "./AssignMemberModal";

type ViewMode = "grid" | "list";

export function OrgMembersView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const { allowed: canManage, plan } = useCanWithPlan({
    capability: "org:members:manage",
    context: activeOrg ? { orgId: activeOrg.orgId } : {},
  });

  if (!session) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
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
  plan,
}: {
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
  const [_changeOccupant, setChangeOccupant] = useState<{ role: string; occupant: RoleOccupant } | null>(null);

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

  const handleChange = useCallback((identityRole: string, occupant: RoleOccupant) => {
    setChangeOccupant({ role: identityRole, occupant });
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
    setChangeOccupant({ role: occupant.profileId, occupant });
  }, []);

  const activeCount = members.filter(m => m.active).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">People</h1>
          <p className="text-sm text-ink-500 mt-1">
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
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="grid place-items-center py-10">
          <Spinner size={22} />
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
    </div>
  );
}
