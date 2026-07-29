// SiteTrack Pro — Promoter dashboard (Phase 7).
//
// The paying firm owner's view: portfolio at a glance + the daily WhatsApp
// digest they receive + handover packets. Finance-first, read-mostly.

import { Link } from "react-router-dom";

import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, StatCard, Icon, Badge, Button } from "@/components/ui/atoms";

export function PromoterDashboard(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canReceiveDigest = useCan("digest:receive");
  const canViewHandover = useCan("handover:view");
  if (!session) return <></>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-primary">Namaskaram, {session.user.name.split(" ")[0]}</h1>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <Badge tone="warning">Promoter</Badge>
          {activeOrg && <span className="text-sm text-fg-secondary">{activeOrg.orgName}</span>}
        </div>
      </div>

      {/* Portfolio stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon="building" label="Projects" value={session.projectMemberships.length || "—"} accent="orange" />
        <StatCard icon="users" label="Organizations" value={session.orgs.length} accent="blue" />
        <StatCard icon="activity" label="Daily digest" value={canReceiveDigest ? "On" : "Off"} accent="emerald" />
      </div>

      {/* Daily digest card */}
      {canReceiveDigest && (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-success-tint text-success grid place-items-center flex-shrink-0"><Icon name="msgcircle" size={20} /></div>
            <div className="flex-1">
              <div className="font-semibold text-fg-primary">7am WhatsApp digest</div>
              <div className="text-sm text-fg-secondary mt-0.5">Every morning: progress, cost-to-date, open risks + yesterday's site photo. You don't log in. Ever.</div>
            </div>
          </div>
        </Card>
      )}

      {/* Handover packets */}
      {canViewHandover && (
        <Card className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-tint text-[var(--st-violet)] grid place-items-center"><Icon name="doc" size={20} /></div>
            <div>
              <div className="font-semibold text-fg-primary">Handover packets</div>
              <div className="text-sm text-fg-secondary">Blockchain-verified bundles for completed projects.</div>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled>Coming Sprint 4</Button>
        </Card>
      )}

      {/* Projects */}
      <div>
        <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">Your projects</h2>
        <Link to="/projects">
          <Card className="p-4 flex items-center justify-between hover:border-accent transition cursor-pointer">
            <span className="text-sm font-semibold text-fg-primary">View all projects</span>
            <Icon name="chevron" size={18} className="text-fg-tertiary" />
          </Card>
        </Link>
      </div>
    </div>
  );
}
