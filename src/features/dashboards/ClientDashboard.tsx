// SiteTrack Pro — Client Dashboard (Phase 2 redesign).
//
// Dedicated dashboard for the client role: at-a-glance KPI stat cards,
// quick-action links, and the client's project portfolio (status + progress).
// Reads via `listClientProjects` (email-scoped), so the client sees exactly
// the projects tied to their account — no org/membership indirection.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth, ROLE_LABEL } from "@/auth";
import { Card, Spinner, Alert, Icon, Badge, StatusBadge, ProgressBar, StatCard } from "@/components/ui/atoms";
import { useT } from "@/i18n/I18nProvider";
import { listClientProjects, type ProjectBrief } from "@/app/queries/clientPortalQueries";
import { getTypedClient } from "@/lib/supabase/db";

export function ClientDashboard(): JSX.Element {
  const { session } = useAuth();
  const t = useT();
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState(false);

  const email = session?.user.email ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setBackendError(false);
      const client = await getTypedClient();
      if (cancelled) return;
      if (!client) {
        setBackendError(true);
        setLoading(false);
        return;
      }
      const pRes = await listClientProjects(client, email);
      if (cancelled) return;
      if (pRes.ok) setProjects(pRes.data);
      else setError(pRes.error);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [email]);

  if (!session) return <></>;

  const firstName = (session.user.name || "").trim().split(/\s+/)[0] || "there";
  const activeProjects = projects.filter((p) => p.status === "active");
  const unreadCount = 0; // Notifications will be added here in Phase 8

  if (loading) return <Spinner size={24} />;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (backendError) return <Alert variant="danger">{t("dash.backendNotConfigured")}</Alert>;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-primary">
          {t("dash.welcome", { name: firstName })}
        </h1>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <Badge tone="info">{ROLE_LABEL[session.user.identityRole]}</Badge>
        </div>
        <p className="text-sm text-fg-tertiary mt-2">{t("dash.overviewSubtitle")}</p>
      </div>

      {/* Portfolio stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="building" label={t("dash.projects")} value={projects.length} accent="orange" />
        <StatCard icon="mail" label={t("dash.updatesLabel")} value={unreadCount} accent="blue" />
        <StatCard icon="activity" label={t("dash.activeProjects")} value={activeProjects.length} accent="emerald" />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">{t("dash.quickActions")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link to="/client">
            <Card className="p-4 hover:border-accent transition-all group cursor-pointer h-full">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="shield" size={20} className="text-accent" />
                <h3 className="font-semibold text-fg-primary group-hover:text-accent">{t("dash.clientPortalLabel")}</h3>
              </div>
              <p className="text-sm text-fg-tertiary">{t("dash.clientPortalHint")}</p>
            </Card>
          </Link>

          <Link to="/dpr/history">
            <Card className="p-4 hover:border-accent transition-all group cursor-pointer h-full">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="clipboard" size={20} className="text-accent" />
                <h3 className="font-semibold text-fg-primary group-hover:text-accent">{t("dash.dailyReportsLabel")}</h3>
              </div>
              <p className="text-sm text-fg-tertiary">{t("dash.dailyReportsHint")}</p>
            </Card>
          </Link>

          <Link to="/handover">
            <Card className="p-4 hover:border-accent transition-all group cursor-pointer h-full">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="doc" size={20} className="text-accent" />
                <h3 className="font-semibold text-fg-primary group-hover:text-accent">{t("dash.handoverLabel")}</h3>
              </div>
              <p className="text-sm text-fg-tertiary">{t("dash.handoverHintShort")}</p>
            </Card>
          </Link>
        </div>
      </div>

      {/* Projects */}
      {projects.length === 0 ? (
        <Card className="p-8 text-center">
          <Icon name="building" size={32} className="mx-auto mb-3 opacity-30" />
          <h3 className="font-semibold text-fg-primary mb-1">{t("dash.noProjectsYet")}</h3>
          <p className="text-sm text-fg-tertiary">{t("dash.noProjectsHint")}</p>
        </Card>
      ) : (
        <div>
          <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">{t("dash.yourProjects")}</h2>
          <div className="space-y-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="p-4 hover:border-accent transition-all group cursor-pointer">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-fg-primary group-hover:text-accent truncate">{p.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {p.location && (
                          <div className="flex items-center gap-1.5 text-fg-tertiary text-xs">
                            <Icon name="map" size={12} />
                            {p.location}
                          </div>
                        )}
                        <Badge tone="neutral" className="text-xs">{p.type || "construction"}</Badge>
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-fg-tertiary">{t("dash.progress")}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <ProgressBar value={p.progress} ariaLabel={`${p.name} progress`} className="flex-1" />
                      <span className="text-xs font-semibold text-fg-primary shrink-0">{p.progress}%</span>
                    </div>
                    <Icon name="chevron" size={16} className="text-fg-tertiary" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}