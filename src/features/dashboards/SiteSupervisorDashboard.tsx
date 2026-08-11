// SiteTrack Pro — field dashboard (Phase 7).
//
// Rendered for the site_engineer role (which absorbed site_supervisor in
// the 2026-06-04 consolidation). Minimal, action-first: the field user's
// whole job in the app is to file the daily progress report. So the
// dashboard is one big CTA + today's status.

import { Link } from "react-router-dom";

import { useAuth } from "@/auth";
import { Card, Icon, Badge } from "@/components/ui/atoms";

export function SiteSupervisorDashboard(): JSX.Element {
  const { session } = useAuth();
  if (!session) return <></>;

  return (
    <div className="max-w-xl mx-auto space-y-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Namaskaram, {session.user.name.split(" ")[0]}</h1>
        <div className="mt-1.5"><Badge tone="info">Site Engineer</Badge></div>
      </div>

      {/* Primary CTA — file the DPR */}
      <Link to="/dpr">
        <Card className="p-6 hover:border-accent transition cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent text-white grid place-items-center flex-shrink-0">
              <Icon name="phone" size={26} />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-fg-primary">File today's report</div>
              <div className="text-sm text-fg-secondary mt-0.5">Speak your update in Telugu, add a photo, send to the promoter.</div>
            </div>
            <Icon name="chevron" size={20} className="text-fg-tertiary" />
          </div>
        </Card>
      </Link>

      {/* What the supervisor can do */}
      <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Your project assignments</h3>}>
        {session.projectMemberships.length === 0 ? (
          <div className="text-sm text-fg-secondary">You're not assigned to a project yet. Ask your PM to add you.</div>
        ) : (
          <div className="space-y-2">
            {session.projectMemberships.map(pm => (
              <Link key={pm.projectId} to={`/projects/${pm.projectId}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary transition">
                <span className="text-sm font-medium text-fg-primary">{pm.projectName}</span>
                <Icon name="arrow" size={14} className="text-fg-tertiary rotate-180" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
