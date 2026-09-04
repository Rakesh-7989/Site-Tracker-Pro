// SiteTrack Pro — Promoter dashboard (Phase 2 redesign).
//
// The paying firm owner's view: portfolio at a glance (real member-scoped
// project list) + the daily digest they receive + handover packets.
// Finance-first, read-mostly. Every visible string is localized.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth, useCan, useOrgSwitcher, ROLE_LABEL } from "@/auth";
import { Card, StatCard, Icon, Badge, Button, StatusBadge, ProgressBar, Alert } from "@/components/ui/atoms";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/I18nProvider";
import { listProjectsForOrg, memberProjectScope, type ProjectSummary } from "@/app/queries/queries";
import { getTypedClient } from "@/lib/supabase/db";

export function PromoterDashboard(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canReceiveDigest = useCan("digest:receive");
  const canViewHandover = useCan("handover:view");
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-primary">
          {t("dash.welcome", { name: firstName })}
        </h1>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <Badge tone="warning">{ROLE_LABEL[session.user.identityRole]}</Badge>
          {activeOrg && <span className="text-sm text-fg-secondary">{t("dash.atOrg", { org: activeOrg.orgName })}</span>}
        </div>
      </div>

      {/* Portfolio stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon="building" label={t("dash.projects")} value={loading ? "—" : projects.length} accent="orange" />
        <StatCard icon="activity" label={t("dash.active")} value={loading ? "—" : activeCount} accent="emerald" />
        <StatCard icon="users" label={t("dash.orgs")} value={session.orgs.length} accent="blue" />
      </div>

      {/* Daily digest card */}
      {canReceiveDigest && (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-success-tint text-success grid place-items-center flex-shrink-0"><Icon name="msgcircle" size={20} /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg-primary">{t("dash.digestTitle")}</span>
                <Badge tone="success">{t("dash.digestEnabled")}</Badge>
              </div>
              <div className="text-sm text-fg-secondary mt-0.5">{t("dash.digestHint")}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Handover packets */}
      {canViewHandover && (
        <Card className="p-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-tint text-violet grid place-items-center flex-shrink-0"><Icon name="doc" size={20} /></div>
            <div>
              <div className="font-semibold text-fg-primary">{t("dash.handoverTitle")}</div>
              <div className="text-sm text-fg-secondary">{t("dash.handoverHint")}</div>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled>{t("dash.comingSoon")}</Button>
        </Card>
      )}

      {/* Projects */}
      <div>
        <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">{t("dash.yourProjects")}</h2>
        {loading ? (
          <div className="space-y-2" role="status" aria-label="Loading projects" aria-busy="true">
            <Skeleton decorative height={56} />
            <Skeleton decorative height={56} />
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
            <Link to="/projects">
              <Card className="p-4 flex items-center justify-between hover:border-accent transition cursor-pointer">
                <span className="text-sm font-semibold text-fg-primary">{t("dash.viewAllProjects")}</span>
                <Icon name="chevron" size={18} className="text-fg-tertiary" />
              </Card>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}