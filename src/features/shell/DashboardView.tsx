// SiteTrack Pro — v3 dashboard.
//
// Role-aware greeting + capability-driven quick actions. Demonstrates the
// new auth layer powering the UI: the action tiles only appear when the
// user holds the capability in the active-org context.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth, useOrgSwitcher, useCan, ROLE_LABEL } from "@/auth";
import { Card, Icon, Badge, StatusBadge, ProgressBar, Alert } from "@/components/ui/atoms";
import { Skeleton } from "@/components/ui/Skeleton";
import type { IconName } from "@/components/ui/icons";
import { useT } from "@/i18n/I18nProvider";
import { getClient } from "@/lib/supabase/supabase";
import { getTypedClient } from "@/lib/supabase/db";
import { isOnboardingDone } from "@/app/queries/onboardingQueries";
import { listProjectsForOrg, memberProjectScope, type ProjectSummary } from "@/app/queries/queries";

export function DashboardView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const t = useT();
  const orgCtx = activeOrg ? { orgId: activeOrg.orgId } : {};

  const canCreate = useCan("project:create", orgCtx);
  const canViewDpr = useCan("dpr:view");
  const canManageMembers = useCan("org:members:manage", orgCtx);
  const canViewAudit = useCan("audit:read");

  // Fresh-org guidance: org admins of an org that never completed the wizard
  // get a "Finish setup" nudge. Fail-open hidden (default true) so nobody is
  // nagged by a data error.
  const [showSetupNudge, setShowSetupNudge] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!activeOrg || session?.user.identityRole !== "orgadmin") return;
        const client = await getClient();
        if (!client) return;
        const done = await isOnboardingDone(client, activeOrg.orgId);
        if (!done && !cancelled) setShowSetupNudge(true);
      } catch { /* stay hidden */ }
    })();
    return () => { cancelled = true; };
  }, [activeOrg, session?.user.identityRole]);

  // Org-scoped "Your projects" list: the member only ever sees the projects
  // they're assigned to (memberProjectScope enforces RLS-safe scoping).
  const [memberProjects, setMemberProjects] = useState<ProjectSummary[]>([]);
  const [memberLoading, setMemberLoading] = useState(true);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBackendError, setMemberBackendError] = useState(false);
  useEffect(() => {
    if (!session || !activeOrg) return;
    let cancelled = false;
    (async () => {
      const client = await getTypedClient();
      if (cancelled) return;
      if (!client) {
        setMemberBackendError(true);
        setMemberLoading(false);
        return;
      }
      try {
        const res = await listProjectsForOrg(client, activeOrg.orgId, memberProjectScope(session));
        if (cancelled) return;
        if (res.ok) {
          setMemberProjects(res.data);
        } else {
          setMemberError(res.error);
        }
      } catch {
        if (!cancelled) setMemberError("dashError");
      }
      setMemberLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeOrg, session]);

  if (!session) return <></>;

  // Labels reuse the nav i18n keys (same surfaces).
  const actions: Array<{ to: string; labelKey: string; icon: IconName; show: boolean }> = [
    { to: "/projects/new", labelKey: "nav.newProject", icon: "plus", show: canCreate },
    { to: "/dpr", labelKey: "nav.dailyReports", icon: "clipboard", show: canViewDpr },
    { to: "/org/members", labelKey: "nav.members", icon: "users", show: canManageMembers },
    { to: "/audit", labelKey: "nav.auditLog", icon: "shield", show: canViewAudit },
  ];
  const visibleActions = actions.filter(a => a.show);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Fresh-org setup nudge */}
      {showSetupNudge && (
        <Card className="p-4 flex items-center gap-3 border-accent/40 bg-accent-tint">
          <Icon name="flag" size={18} className="text-accent flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-fg-primary">Finish setting up your workspace</div>
            <div className="text-xs text-fg-secondary">Pick your plan, invite your team and explore — takes about a minute.</div>
          </div>
          <Link to="/org/onboarding" className="flex-shrink-0">
            <span className="inline-flex items-center text-xs font-bold text-accent hover:underline">{t("common.view")} →</span>
          </Link>
        </Card>
      )}

      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-primary">
          {t("dash.welcome", { name: session.user.name.split(" ")[0] })}
        </h1>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <Badge tone="info">{ROLE_LABEL[session.user.identityRole]}</Badge>
          {activeOrg && <span className="text-sm text-fg-secondary">{t("dash.atOrg", { org: activeOrg.orgName })}</span>}
          {session.user.isStaff && <Badge tone="warning">{t("dash.staff")}</Badge>}
        </div>
      </div>

      {/* Quick actions */}
      {visibleActions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">{t("dash.quickActions")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {visibleActions.map(a => (
              <Link key={a.to} to={a.to}>
                <Card className="p-4 hover:border-accent transition cursor-pointer h-full">
                  <div className="w-9 h-9 rounded-lg bg-accent-tint text-accent grid place-items-center mb-2">
                    <Icon name={a.icon} size={18} />
                  </div>
                  <div className="text-sm font-semibold text-fg-primary">{t(a.labelKey)}</div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Membership summary */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-3xl font-display font-bold text-fg-primary">{session.orgs.length}</div>
          <div className="text-xs text-fg-secondary mt-0.5">{t("dash.orgs")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-3xl font-display font-bold text-fg-primary">{session.projectMemberships.length}</div>
          <div className="text-xs text-fg-secondary mt-0.5">{t("dash.projectAssignments")}</div>
        </Card>
        <Card className="p-4">
          <Link to="/projects" className="flex items-center justify-between h-full group">
            <div>
              <div className="text-sm font-semibold text-fg-primary">{t("dash.viewProjects")}</div>
              <div className="text-xs text-fg-secondary mt-0.5">{t("dash.browseManage")}</div>
            </div>
            <Icon name="chevron" size={18} className="text-fg-tertiary group-hover:text-accent transition" />
          </Link>
        </Card>
      </div>

      {/* Member projects */}
      {activeOrg && (
        <div>
          <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">{t("dash.yourProjects")}</h2>
          {memberLoading ? (
            <div className="space-y-2" role="status" aria-busy="true">
              <Skeleton decorative height={56} />
              <Skeleton decorative height={56} />
            </div>
          ) : memberBackendError ? (
            <Alert variant="danger">{t("dash.backendNotConfigured")}</Alert>
          ) : memberError ? (
            <Alert variant="danger">{memberError}</Alert>
          ) : memberProjects.length === 0 ? (
            <div className="text-sm text-fg-secondary">{t("dash.notAssignedHint")}</div>
          ) : (
            <div className="space-y-2">
              {memberProjects.slice(0, 5).map(project => (
                <Link key={project.id} to={`/projects/${project.id}`}>
                  <Card className="p-4 hover:border-accent transition cursor-pointer">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-fg-primary truncate">{project.name}</span>
                          <StatusBadge status={project.status ?? "active"} />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <ProgressBar value={project.progress} ariaLabel={`${project.name} progress`} className="flex-1" />
                          <span className="text-[11px] text-fg-tertiary shrink-0">{project.progress}%</span>
                        </div>
                      </div>
                      <Icon name="chevron" size={18} className="text-fg-tertiary flex-shrink-0" />
                    </div>
                  </Card>
                </Link>
              ))}
              {memberProjects.length > 5 && (
                <Link to="/projects">
                  <Card className="p-4 flex items-center justify-between hover:border-accent transition cursor-pointer">
                    <span className="text-sm font-semibold text-fg-primary">{t("dash.viewAllProjects")}</span>
                    <Icon name="chevron" size={18} className="text-fg-tertiary" />
                  </Card>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
