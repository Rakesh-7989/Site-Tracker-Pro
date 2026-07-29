// SiteTrack Pro — role-routed dashboard (Phase 7).
//
// /dashboard renders a role-specific surface. The mapping is in the pure
// dashboardForRole() so it's unit-tested; this component just dispatches.

import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Spinner } from "@/components/ui/atoms";
import { dashboardForRole } from "./dashboardForRole";
import { PromoterDashboard } from "./PromoterDashboard";
import { SiteSupervisorDashboard } from "./SiteSupervisorDashboard";
import { DashboardView } from "../shell/DashboardView";

export function RoleDashboard(): JSX.Element {
  const { session } = useAuth();
  if (!session) {
    return <div className="grid place-items-center py-20 text-accent"><Spinner size={24} /></div>;
  }
  const kind = dashboardForRole(session.user.identityRole);
  switch (kind) {
    case "promoter":
      return <PromoterDashboard />;
    case "field":
      return <SiteSupervisorDashboard />;
    case "pm":
      return <Navigate to="/pm" replace />;
    // 'client' + 'default' use the capability-driven generic dashboard for
    // now; a dedicated client portal lands in a Phase 7 sub-pass.
    case "client":
    case "default":
    default:
      return <DashboardView />;
  }
}
