// SiteTrack Pro — Field dashboard (Phase 2 redesign).
//
// Rendered for the site_engineer role. Action-first: file the daily progress
// report, then show the member's live project assignments (status + progress).
// Projects are read through `listProjectsForOrg(..., memberProjectScope(session))`
// so the engineer only ever sees the projects they are assigned to.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth, useOrgSwitcher, ROLE_LABEL } from "@/auth";
import { Card, Badge, Icon, StatusBadge, ProgressBar, StatCard, Alert } from "@/components/ui/atoms";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/I18nProvider";
import { listProjectsForOrg, memberProjectScope, type ProjectSummary } from "@/app/queries/queries";
import { getTypedClient } from "@/lib/supabase/db";

export function SiteSupervisorDashboard(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const t = useT();

  const orgId = activeOrg?.orgId ?? "";

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      if (!orgId) {
        setLoading(false);
        return;
      }
      const client = await getTypedClient();
      if (cancelled) return;
      if (!client) {
        setBackendError(true);
        setLoading(false);
        return;
      }
      const res = await listProjectsForOrg(client, orgId, memberProjectScope(session));
      if (cancelled) return;
      if (res.ok) setProjects(res.data);
      else setError(res.error);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, session]);

  if (!session) return <></>;

  const firstName = (session.user.name || "").trim().split(/\s+/)[0] || "there";
  const activeCount = projects.filter((p) => p.status === "active").length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-primary">
          {t("dash.welcome", { name: firstName })}
        </h1>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <Badge tone="info">{ROLE_LABEL[session.user.identityRole]}</Badge>
          {activeOrg && <span className="text-sm text-fg-secondary">{t("dash.atOrg", { org: activeOrg.orgName })}</span>}
        </div>
      </div>

      {/* Primary CTA — file the DPR */}
      <Link to="/dpr">
        <Card className="p-6 hover:border-accent transition cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent text-white grid place-items-center flex-shrink-0">
              <Icon name="phone" size={26} />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-fg-primary">{t("dash.todayReport")}</div>
              <div className="text-sm text-fg-secondary mt-0.5">{t("dash.todayReportHint")}</div>
            </div>
            <Icon name="chevron" size={20} className="text-fg-tertiary" />
          </div>
        </Card>
      </Link>

      {/* Portfolio stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon="building" label={t("dash.projects")} value={loading ? "—" : projects.length} accent="orange" />
        <StatCard icon="activity" label={t("dash.active")} value={loading ? "—" : activeCount} accent="emerald" />
      </div>

      {/* Project assignments */}
      <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dash.yourProjects")}</h3>}>
        {loading ? (
          <div className="space-y-3" role="status" aria-label="Loading projects" aria-busy="true">
            <Skeleton decorative height={44} />
            <Skeleton decorative height={44} />
            <Skeleton decorative height={44} />
          </div>
        ) : backendError ? (
          <Alert variant="danger">{t("dash.backendNotConfigured")}</Alert>
        ) : error ? (
          <Alert variant="danger">{error}</Alert>
        ) : projects.length === 0 ? (
          <div className="text-sm text-fg-secondary">{t("dash.notAssignedHint")}</div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-lg hover:bg-secondary transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg-primary truncate">{project.name}</span>
                    <StatusBadge status={project.status ?? "active"} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <ProgressBar value={project.progress} ariaLabel={`${project.name} progress`} className="flex-1" />
                    <span className="text-[11px] text-fg-tertiary shrink-0">{project.progress}%</span>
                  </div>
                </div>
                <Icon name="chevron" size={16} className="text-fg-tertiary flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}