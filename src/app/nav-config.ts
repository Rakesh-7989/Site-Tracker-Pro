// SiteTrack Pro — role-aware navigation config (pure, testable).
//
// Maps the capability set (from @/auth RoleResolver) to the list of nav
// items a user should see. The Sidebar renders whatever buildNav returns.
// Keeping this pure means we can unit-test "what does an architect see
// vs a client" without rendering React.

import type { AuthSession } from "@/auth";
import { capabilitiesAnywhere } from "@/auth";
import type { Capability } from "@/auth";
import type { IconName } from "@/components/ui/icons";

export interface NavItem {
  /** Route path (relative to the shell root). */
  to: string;
  /** Display label. */
  label: string;
  /** Icon name (resolved by the Icon atom). */
  icon: IconName;
  /**
   * The capability that unlocks this item. When omitted, the item is
   * always shown to any signed-in user (e.g. Dashboard).
   */
  requires?: Capability;
  /** Optional grouping header shown above the item. */
  group?: string;
}

/**
 * The full nav catalog. Order here = display order. `requires` gates
 * visibility against the user's aggregate capabilities.
 */
export const NAV_CATALOG: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "home", group: "Workspace" },
  { to: "/projects", label: "Projects", icon: "folder", group: "Workspace" },
  { to: "/projects/new", label: "New Project", icon: "plus", requires: "project:create", group: "Workspace" },

  { to: "/dpr", label: "Daily Reports", icon: "clipboard", requires: "dpr:view", group: "Field" },

  { to: "/activity", label: "Activity", icon: "activity", requires: "activity:view", group: "Insights" },
  { to: "/audit", label: "Audit Log", icon: "shield", requires: "audit:read", group: "Insights" },

  { to: "/org/members", label: "Members", icon: "users", requires: "org:members:manage", group: "Org Admin" },
  { to: "/org/billing", label: "Billing", icon: "credit-card", requires: "org:billing:manage", group: "Org Admin" },
  { to: "/org/integrations", label: "Integrations", icon: "plug", requires: "org:integrations:manage", group: "Org Admin" },

  { to: "/admin/users", label: "Users", icon: "user-cog", requires: "platform:users:manage", group: "Platform" },
  { to: "/admin/orgs", label: "Organizations", icon: "building", requires: "platform:orgs:manage", group: "Platform" },
];

/**
 * Build the nav list a given session can see. Uses the AGGREGATE
 * capability set (across every org + project the user belongs to) so the
 * sidebar shows everything they could reach somewhere — the per-screen
 * guards still re-check with the precise context.
 *
 * @param session   the current auth session (null → empty nav)
 */
export function buildNav(session: AuthSession | null): NavItem[] {
  if (!session) return [];
  const caps = capabilitiesAnywhere(session);
  return NAV_CATALOG.filter(item => !item.requires || caps.has(item.requires));
}

/**
 * Group the nav items by their `group` field, preserving catalog order.
 * Returns an ordered list of { group, items } for sectioned rendering.
 */
export function groupNav(items: NavItem[]): Array<{ group: string; items: NavItem[] }> {
  const order: string[] = [];
  const map = new Map<string, NavItem[]>();
  for (const item of items) {
    const g = item.group ?? "";
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g)!.push(item);
  }
  return order.map(group => ({ group, items: map.get(group)! }));
}
