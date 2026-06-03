// SiteTrack Pro — project Overview tab (Phase 6, real).
//
// Shows project facts + a membership summary + period. Demonstrates the
// data layer feeding a real tab. Edit actions (settings) are capability-
// gated.

import { useOrgSwitcher, useCan, ROLE_LABEL } from "@/auth";
import { Card, StatCard, Badge, Icon } from "@/components/ui/atoms";
import type { ProjectDetail, ProjectMemberRow } from "@/app/queries";
import { roleMeta } from "@/components/ui/role-meta";
import type { IdentityRole } from "@/auth";

const TYPE_LABEL: Record<string, string> = {
  construction: "Construction", interior: "Interior", design: "Design", consultant: "Consultant",
};

export function OverviewTab({ project, members }: { project: ProjectDetail; members: ProjectMemberRow[] }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canEditSettings = useCan("project:settings:edit", {
    orgId: activeOrg?.orgId, projectId: project.id,
  });

  // Members grouped by role for the summary.
  const byRole = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-bold text-ink-900">{project.name}</h2>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
            <Badge tone="info">{TYPE_LABEL[project.type] ?? project.type}</Badge>
            {project.location && <span className="text-ink-500">{project.location}</span>}
            {project.status && <Badge tone="neutral">{project.status}</Badge>}
          </div>
        </div>
        {canEditSettings && (
          <button className="text-xs font-semibold text-safety-600 hover:text-safety-700 inline-flex items-center gap-1">
            <Icon name="sliders" size={13} /> Settings
          </button>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="users" label="Team" value={members.length} accent="blue" />
        <StatCard icon="calendar" label="Started" value={project.startedAt ? project.startedAt.slice(0, 10) : "—"} accent="orange" />
        <StatCard icon="flag" label="Type" value={TYPE_LABEL[project.type] ?? project.type} accent="violet" />
        <StatCard icon="check" label="Status" value={project.status ?? "Active"} accent="emerald" />
      </div>

      {/* Membership summary */}
      <Card className="p-5">
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400 mb-3">Team composition</h3>
        {members.length === 0 ? (
          <div className="text-sm text-ink-500">No members assigned to this project yet.</div>
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
