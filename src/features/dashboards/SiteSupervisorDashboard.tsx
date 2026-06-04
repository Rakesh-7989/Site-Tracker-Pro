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
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Namaskaram, {session.user.name.split(" ")[0]}</h1>
        <div className="mt-1.5"><Badge tone="info">Site Engineer</Badge></div>
      </div>

      {/* Primary CTA — file the DPR */}
      <Link to="/dpr">
        <Card className="p-6 hover:border-safety-300 transition cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-safety-500 text-white grid place-items-center flex-shrink-0">
              <Icon name="phone" size={26} />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-ink-900">File today's report</div>
              <div className="text-sm text-ink-500 mt-0.5">Speak your update in Telugu, add a photo, send to the promoter.</div>
            </div>
            <Icon name="chevron" size={20} className="text-ink-400" />
          </div>
        </Card>
      </Link>

      {/* What the supervisor can do */}
      <Card className="p-5">
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400 mb-3">Your project assignments</h3>
        {session.projectMemberships.length === 0 ? (
          <div className="text-sm text-ink-500">You're not assigned to a project yet. Ask your PM to add you.</div>
        ) : (
          <div className="space-y-2">
            {session.projectMemberships.map(pm => (
              <Link key={pm.projectId} to={`/projects/${pm.projectId}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream-100 transition">
                <span className="text-sm font-medium text-ink-800">{pm.projectName}</span>
                <Icon name="arrow" size={14} className="text-ink-400 rotate-180" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
