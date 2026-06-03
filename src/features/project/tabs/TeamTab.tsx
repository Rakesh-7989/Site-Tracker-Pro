// SiteTrack Pro — project Team tab (Phase 6, real).
//
// Lists active project members with their per-project role. "Manage"
// affordance is capability-gated (team:manage). Adding/removing members
// via a form lands in a Phase 6 sub-pass; this is the read surface.

import { useOrgSwitcher, useCan, ROLE_LABEL } from "@/auth";
import { Card, Avatar, Badge, Icon } from "@/components/ui/atoms";
import type { ProjectMemberRow } from "@/app/queries";
import type { IdentityRole } from "@/auth";

export function TeamTab({ projectId, members }: { projectId: string; members: ProjectMemberRow[] }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("team:manage", { orgId: activeOrg?.orgId, projectId });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink-900">Team</h2>
        {canManage && (
          <button className="text-xs font-semibold text-safety-600 hover:text-safety-700 inline-flex items-center gap-1">
            <Icon name="plus" size={13} /> Add member
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-500">No members assigned yet.</Card>
      ) : (
        <Card className="divide-y divide-cream-100">
          {members.map(m => (
            <div key={m.profileId} className="flex items-center gap-3 p-3">
              <Avatar initials={m.name} size="sm" role={m.role} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-800 truncate">{m.name}</div>
                {m.assignedAt && <div className="text-[11px] text-ink-400">since {m.assignedAt.slice(0, 10)}</div>}
              </div>
              <Badge tone="neutral">{ROLE_LABEL[m.role as IdentityRole] ?? m.role}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
