// SiteTrack Pro — Org → Custom Roles (/org/roles). Self-service custom roles
// for Business/Enterprise orgs (plan-gating Phase 3). Org admins define their own
// roles + capabilities; the DB (migration 98) enforces the plan gate + blocks
// platform:* capability escalation. Lower-plan orgs see an upgrade prompt.

import {
  useAuth, useCanWithPlan, useOrgSwitcher, PlanGate,
  displayPlanLabel, identityRoleLabel, identityRolesForPlan,
  planFeatureLabelsFor, planSupportsCustomRoles,
  projectTierRoleLabel, projectTierRolesForPlan,
} from "@/auth";
import { Alert, AccessDenied, Badge, Card, Spinner } from "@/components/ui/atoms";
import { CustomRolesPanel } from "@/features/admin/CustomRolesPanel";

export function OrgRolesView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const { allowed: canManage, plan, planLoading } = useCanWithPlan({
    capability: "org:members:manage",
    context: activeOrg ? { orgId: activeOrg.orgId } : {},
  });
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  // SEC-05: plan caps still resolving → hold the spinner, don't flash AccessDenied.
  if (planLoading) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (!canManage) return <AccessDenied message="Org admin access required." />;

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Custom Roles</h1>
        <div className="text-sm text-fg-secondary">
          Define org-specific roles (e.g. “Site Lead”, “Billing Head”) with their own feature set,
          then assign members in <b>People</b>. Platform-admin powers can’t be granted here.
        </div>
      </div>
      <PlanRoleSummary plan={plan} loading={planLoading} />

      {/* Business/Enterprise feature; lower-plan orgs get the upgrade card. */}
      <PlanGate feature="custom_roles">
        <CustomRolesPanel orgId={activeOrg.orgId} createdBy={session.user.id} hidePlatformCaps />
      </PlanGate>
    </div>
  );
}

function PlanRoleSummary({ plan, loading }: { plan: string | null; loading: boolean }): JSX.Element {
  const effectivePlan = plan ?? "enterprise";
  const identityRoles = identityRolesForPlan(effectivePlan).map(identityRoleLabel);
  const projectRoles = projectTierRolesForPlan(effectivePlan).map(projectTierRoleLabel);
  const features = planFeatureLabelsFor(effectivePlan);
  const customRoles = planSupportsCustomRoles(effectivePlan);

  return (
    <Card padding="md" title={<div>
      <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Plan role defaults</h2>
      <div className="text-sm text-fg-primary mt-1">
        {loading ? (
          <span className="inline-flex items-center gap-2"><Spinner size={13} /> Checking active plan...</span>
        ) : (
          <span><b>{plan ? displayPlanLabel(effectivePlan) : "Plan unavailable"}</b> controls which standard roles and paid feature groups are exposed.</span>
        )}
      </div>
    </div>} action={<Badge tone={customRoles ? "success" : "warning"}>{customRoles ? "Custom roles unlocked" : "Custom roles locked"}</Badge>}>
      <div className="space-y-3">
      <SummaryRow label="Identity roles" values={identityRoles} max={10} />
      <SummaryRow label="Project roles" values={projectRoles} max={10} />
      <SummaryRow label="Feature groups" values={features} max={8} />
      </div>
    </Card>
  );
}

function SummaryRow({ label, values, max = 6 }: { label: string; values: string[]; max?: number }): JSX.Element {
  const shown = values.slice(0, max);
  const extra = values.length - shown.length;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(value => <Badge key={value} tone="neutral">{value}</Badge>)}
        {extra > 0 && <Badge tone="info">+{extra} more</Badge>}
      </div>
    </div>
  );
}
