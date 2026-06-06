// SiteTrack Pro — Org → Custom Roles (/org/roles). Self-service custom roles
// for ENTERPRISE-plan orgs (plan-gating Phase 3). Org admins define their own
// roles + capabilities; the DB (migration 98) enforces the plan gate + blocks
// platform:* capability escalation. Non-Enterprise orgs see an upgrade prompt.

import { useAuth, useCan, useOrgSwitcher, PlanGate } from "@/auth";
import { Alert, AccessDenied } from "@/components/ui/atoms";
import { CustomRolesPanel } from "@/features/admin/CustomRolesPanel";

export function OrgRolesView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("org:members:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Org admin access required." />;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Custom Roles</h1>
        <div className="text-sm text-ink-500">
          Define org-specific roles (e.g. “Site Lead”, “Billing Head”) with their own feature set,
          then assign members in <b>People</b>. Platform-admin powers can’t be granted here.
        </div>
      </div>
      {/* Enterprise-only feature; non-Enterprise orgs get the upgrade card. */}
      <PlanGate feature="custom_roles">
        <CustomRolesPanel orgId={activeOrg.orgId} createdBy={session.user.id} hidePlatformCaps />
      </PlanGate>
    </div>
  );
}
