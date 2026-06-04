// SiteTrack Pro — role → dashboard selector (Phase 7, pure + testable).
//
// The v3 /dashboard route renders a role-specific dashboard. This pure
// function maps an identity role to a dashboard "kind" so the routing
// component stays dumb + the mapping is unit-tested.

import type { IdentityRole } from "@/auth";

export type DashboardKind = "promoter" | "field" | "client" | "default";

/**
 * Pick the dashboard for an identity role.
 *   - promoter            → finance-first promoter view
 *   - site_engineer       → minimal voice-DPR-first field view
 *                           (absorbs the former site_supervisor role)
 *   - client              → read-only buyer view
 *   - everyone else       → the standard capability-driven dashboard
 */
export function dashboardForRole(role: IdentityRole): DashboardKind {
  switch (role) {
    case "promoter":
      return "promoter";
    case "site_engineer":
      return "field";
    case "client":
      return "client";
    default:
      return "default";
  }
}
