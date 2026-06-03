// SiteTrack Pro — v3 dashboard.
//
// Role-aware greeting + capability-driven quick actions. Demonstrates the
// new auth layer powering the UI: the action tiles only appear when the
// user holds the capability in the active-org context.

import { Link } from "react-router-dom";

import { useAuth, useOrgSwitcher, useCan, ROLE_LABEL } from "@/auth";
import { Card, Icon, Badge } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";

export function DashboardView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const orgCtx = activeOrg ? { orgId: activeOrg.orgId } : {};

  const canCreate = useCan("project:create", orgCtx);
  const canViewDpr = useCan("dpr:view");
  const canManageMembers = useCan("org:members:manage", orgCtx);
  const canViewAudit = useCan("audit:read");

  if (!session) return <></>;

  const actions: Array<{ to: string; label: string; icon: IconName; show: boolean }> = [
    { to: "/projects/new", label: "New Project", icon: "plus", show: canCreate },
    { to: "/dpr", label: "Daily Reports", icon: "clipboard", show: canViewDpr },
    { to: "/org/members", label: "Members", icon: "users", show: canManageMembers },
    { to: "/audit", label: "Audit Log", icon: "shield", show: canViewAudit },
  ];
  const visibleActions = actions.filter(a => a.show);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">
          Welcome, {session.user.name.split(" ")[0]}
        </h1>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <Badge tone="info">{ROLE_LABEL[session.user.identityRole]}</Badge>
          {activeOrg && <span className="text-sm text-ink-500">at {activeOrg.orgName}</span>}
          {session.user.isStaff && <Badge tone="warning">Staff</Badge>}
        </div>
      </div>

      {/* Quick actions */}
      {visibleActions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400 mb-2">Quick actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {visibleActions.map(a => (
              <Link key={a.to} to={a.to}>
                <Card className="p-4 hover:border-safety-300 transition cursor-pointer h-full">
                  <div className="w-9 h-9 rounded-lg bg-safety-50 text-safety-600 grid place-items-center mb-2">
                    <Icon name={a.icon} size={18} />
                  </div>
                  <div className="text-sm font-semibold text-ink-800">{a.label}</div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Membership summary */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-3xl font-display font-bold text-ink-900">{session.orgs.length}</div>
          <div className="text-xs text-ink-500 mt-0.5">Organization{session.orgs.length === 1 ? "" : "s"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-3xl font-display font-bold text-ink-900">{session.projectMemberships.length}</div>
          <div className="text-xs text-ink-500 mt-0.5">Project assignment{session.projectMemberships.length === 1 ? "" : "s"}</div>
        </Card>
        <Card className="p-4">
          <Link to="/projects" className="flex items-center justify-between h-full group">
            <div>
              <div className="text-sm font-semibold text-ink-800">View projects</div>
              <div className="text-xs text-ink-500 mt-0.5">Browse + manage</div>
            </div>
            <Icon name="chevron" size={18} className="text-ink-400 group-hover:text-safety-500 transition" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
