// SiteTrack Pro — project Overview tab (Phase 6, real).
//
// Shows project facts + a membership summary + period. Demonstrates the
// data layer feeding a real tab. Edit actions (settings) are capability-
// gated.
//
// v4 D6: adds a "Registers" strip — live counts for the drawings / FF&E /
// statutory / PO registers, each linking to its tab. Each chip is gated by
// the exact same rules as the tab itself (isTabVisible → capability + plan +
// segment + project-type). An amber alert surfaces approved NOCs expiring
// within 30 days (isExpiring).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOrgSwitcher, useCan, ROLE_LABEL, useAuth, resolveCapabilities, usePlanCaps } from "@/auth";
import { useModules } from "@/modules";
import { Card, StatCard, Badge, Icon, Alert, Spinner } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/atoms";
import type { ProjectDetail, ProjectMemberRow } from "@/app/queries";
import { roleMeta } from "@/components/ui/role-meta";
import type { IdentityRole } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { getClient } from "@/lib/supabase";
import { listDrawings } from "@/app/designQueries";
import { listFfeEntries } from "@/app/ffeQueries";
import { listStatutoryApprovals, isExpiring } from "@/app/statutoryQueries";
import { listPOs } from "@/app/financeQueries";
import { isTabVisible } from "@/features/project/tabs-config";
import { localDateISO } from "@/lib/dateLocal";

type RegisterCounts = { drawings: number; ffe: number; statutory: number; po: number };

export function OverviewTab({ project, members }: { project: ProjectDetail; members: ProjectMemberRow[] }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const { session } = useAuth();
  const { can: planCan } = usePlanCaps();
  const { isEnabled: moduleEnabled } = useModules();
  const t = useT();
  const typeLabel = (ty: string): string => t(`projType.${ty}`);
  const canEditSettings = useCan("project:settings:edit", {
    orgId: activeOrg?.orgId, projectId: project.id,
  });

  const caps = useMemo(() => {
    if (!session) return new Set<never>();
    return resolveCapabilities(session, { orgId: project.orgId, projectId: project.id }).capabilities;
  }, [session, project.orgId, project.id]);

  const segment = session?.orgs.find(o => o.orgId === session.activeOrgId)?.segment ?? null;
  const visible = (tabId: string): boolean => isTabVisible(tabId, caps, project.type, planCan, segment, undefined, moduleEnabled);

  const [counts, setCounts] = useState<RegisterCounts>({ drawings: 0, ffe: 0, statutory: 0, po: 0 });
  const [loading, setLoading] = useState(true);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const [draw, ffe, stat, po] = await Promise.all([
      visible("drawings") ? listDrawings(client, project.id) : Promise.resolve(null),
      visible("ffe") ? listFfeEntries(client, project.id) : Promise.resolve(null),
      visible("statutory") ? listStatutoryApprovals(client, project.id) : Promise.resolve(null),
      visible("po") ? listPOs(client, project.id) : Promise.resolve(null),
    ]);
    setCounts({
      drawings: draw?.ok ? draw.data.length : 0,
      ffe: ffe?.ok ? ffe.data.length : 0,
      statutory: stat?.ok ? stat.data.length : 0,
      po: po?.ok ? po.data.length : 0,
    });
    setLoading(false);
  }, [project.id, project.type, caps, planCan, segment]);
  useEffect(() => { void loadCounts(); }, [loadCounts]);

  // Members grouped by role for the summary.
  const byRole = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});

  type RegisterChip = { id: string; label: string; icon: IconName; count: number; to: string };
  const allRegisterChips: RegisterChip[] = [
    { id: "drawings", label: "Drawings", icon: "image", count: counts.drawings, to: `/projects/${project.id}/drawings` },
    { id: "ffe", label: "FF&E", icon: "hardhat", count: counts.ffe, to: `/projects/${project.id}/ffe` },
    { id: "statutory", label: "Statutory", icon: "shield", count: counts.statutory, to: `/projects/${project.id}/statutory` },
    { id: "po", label: "POs", icon: "truck", count: counts.po, to: `/projects/${project.id}/po` },
  ];
  const registerChips = allRegisterChips.filter(c => visible(c.id));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-bold text-fg-primary">{project.name}</h2>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
            <Badge tone="info">{typeLabel(project.type)}</Badge>
            {project.location && <span className="text-fg-secondary">{project.location}</span>}
            {project.status && <Badge tone="neutral">{project.status}</Badge>}
          </div>
        </div>
        {canEditSettings && (
          <button className="text-xs font-semibold text-accent hover:text-accent-2 inline-flex items-center gap-1">
            <Icon name="sliders" size={13} /> {t("overviewTab.settings")}
          </button>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="users" label={t("overviewTab.team")} value={members.length} accent="blue" />
        <StatCard icon="calendar" label={t("overviewTab.started")} value={project.startedAt ? project.startedAt.slice(0, 10) : "—"} accent="orange" />
        <StatCard icon="flag" label={t("overviewTab.type")} value={typeLabel(project.type)} accent="violet" />
        <StatCard icon="check" label={t("overviewTab.status")} value={project.status ?? t("overviewTab.active")} accent="emerald" />
      </div>

      {/* Registers cross-link strip (v4 D6) */}
      {registerChips.length > 0 && (
        <Card className="p-5">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-3">Registers</h3>
          {loading ? (
            <div className="grid place-items-center py-3"><Spinner size={18} /></div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {registerChips.map(c => (
                <Link key={c.id} to={c.to} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-secondary hover:bg-bg-secondary/70 border border-border text-sm font-semibold text-fg-primary transition">
                  <Icon name={c.icon} size={14} className="text-fg-tertiary" />
                  <span>{c.label}</span>
                  <Badge tone="neutral">{c.count}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Statutory expiry hotspot (v4 D6) */}
      {visible("statutory") && <StatutoryExpiryAlert projectId={project.id} />}

      {/* Membership summary */}
      <Card className="p-5">
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-3">{t("overviewTab.teamComposition")}</h3>
        {members.length === 0 ? (
          <div className="text-sm text-fg-secondary">{t("overviewTab.noMembers")}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(byRole).map(([role, count]) => {
              const meta = roleMeta(role as IdentityRole);
              return (
                <span key={role} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${meta.bg} ${meta.text}`}>
                  {ROLE_LABEL[role as IdentityRole] ?? role}
                  <span className="opacity-60">×{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatutoryExpiryAlert({ projectId }: { projectId: string }): JSX.Element {
  const [expiring, setExpiring] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = await getClient();
      if (!client) return;
      const res = await listStatutoryApprovals(client, projectId);
      if (cancelled) return;
      if (res.ok) {
        const today = localDateISO();
        const n = res.data.filter(a => a.status === "approved" && isExpiring(a.validUntil, today, 30)).length;
        setExpiring(n);
      } else {
        setExpiring(0);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);
  if (expiring === null || expiring === 0) return <></>;
  return (
    <Link to={`/projects/${projectId}/statutory`} className="block">
      <Alert variant="warning" className="flex items-center gap-2">
        <Icon name="shield" size={14} /> {expiring} NOC{expiring === 1 ? "" : "s"} expiring within 30 days — renew soon.
      </Alert>
    </Link>
  );
}
