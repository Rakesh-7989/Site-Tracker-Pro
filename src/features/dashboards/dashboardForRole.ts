// SiteTrack Pro — role → dashboard selector (Phase 7, pure + testable).
//
// The v3 /dashboard route renders a role-specific dashboard. This pure
// function maps an identity role to a dashboard "kind" so the routing
// component stays dumb + the mapping is unit-tested.

import type { IdentityRole } from "@/auth";

export type DashboardKind = "promoter" | "site-supervisor" | "client" | "default";

/**
 * Pick the dashboard for an identity role.
 *   - promoter            → finance-first promoter view
 *   - site_supervisor     → minimal voice-DPR-first view
 *   - client              → read-only buyer view
 *   - everyone else       → the standard capability-driven dashboard
 */
export function dashboardForRole(role: IdentityRole): DashboardKind {
  switch (role) {
    case "promoter":
      return "promoter";
    case "site_supervisor":
      return "site-supervisor";
    case "client":
      return "client";
    default:
      return "default";
  }
}
