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
  /**
   * Platform staff-tier gate (migration 99). When set, the item is shown ONLY
   * to staff whose tier is in this list (e.g. owner+head). Orthogonal to
   * `requires` — both must pass.
   */
  requiresStaffTier?: Array<"owner" | "head" | "member">;
  /**
   * Admin-area key (migration 106). A staff MEMBER sees this item only if the
   * area is in their granted set; owner/head always see it.
   */
  area?: "signups" | "orgs" | "users" | "roles" | "upgrades";
}

/**
 * The full nav catalog. Order here = display order. `requires` gates
 * visibility against the user's aggregate capabilities.
 */
export const NAV_CATALOG: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "home", group: "Workspace" },
  { to: "/projects", label: "Projects", icon: "folder", group: "Workspace" },
  { to: "/calendar", label: "Calendar", icon: "calendar", group: "Workspace" },
  { to: "/search", label: "Search", icon: "search", group: "Workspace" },
  { to: "/notifications", label: "Notifications", icon: "bell", group: "Workspace" },
  { to: "/messages", label: "Messages", icon: "msgcircle", group: "Workspace" },
  { to: "/client", label: "Client Portal", icon: "shield", requires: "share:client:portal", group: "Workspace" },
  { to: "/pm", label: "PM Dashboard", icon: "hardhat", requires: "project:create", group: "Workspace" },
  { to: "/vendor", label: "Vendor Portal", icon: "truck", requires: "po:create", group: "Workspace" },
  { to: "/projects/new", label: "New Project", icon: "plus", requires: "project:create", group: "Workspace" },

  { to: "/dpr", label: "Daily Reports", icon: "clipboard", requires: "dpr:view", group: "Field" },

  { to: "/vendors", label: "Vendors", icon: "truck", requires: "vendor:manage", group: "Procurement" },
  { to: "/pos", label: "Purchase Orders", icon: "doc", requires: "po:create", group: "Procurement" },
  { to: "/material-prices", label: "Material Prices", icon: "truck", requires: "vendor:manage", group: "Procurement" },
  { to: "/hierarchy", label: "Hierarchy", icon: "building", requires: "project:create", group: "Planning" },
  { to: "/forecast", label: "Cost Forecast", icon: "barChart", requires: "budget:view", group: "Insights" },
  { to: "/delegations", label: "Delegations", icon: "users", requires: "org:approvals:manage", group: "Org Admin" },

  { to: "/analytics", label: "Analytics", icon: "barChart", requires: "budget:view", group: "Insights" },
  { to: "/activity", label: "Activity", icon: "activity", requires: "activity:view", group: "Insights" },
  { to: "/audit", label: "Audit Log", icon: "shield", requires: "audit:read", group: "Insights" },

  { to: "/org", label: "Org Home", icon: "building", requires: "org:members:manage", group: "Org Admin" },
  { to: "/org/members", label: "Members", icon: "users", requires: "org:members:manage", group: "Org Admin" },
  { to: "/org/roles", label: "Custom Roles", icon: "lock", requires: "org:members:manage", group: "Org Admin" },
  { to: "/org/billing", label: "Billing", icon: "credit-card", requires: "org:billing:manage", group: "Org Admin" },
  { to: "/org/templates", label: "Templates", icon: "doc", requires: "org:templates:manage", group: "Org Admin" },
  { to: "/org/approvals", label: "Approvals", icon: "check", requires: "org:approvals:manage", group: "Org Admin" },
  { to: "/org/notifications", label: "Notifications", icon: "bell", requires: "org:notifications:manage", group: "Org Admin" },
  { to: "/org/integrations", label: "Integrations", icon: "plug", requires: "org:integrations:manage", group: "Org Admin" },
  { to: "/org/features", label: "Features", icon: "sliders", requires: "org:features:configure", group: "Org Admin" },

  { to: "/admin", label: "Platform", icon: "dashboard", requires: "platform:orgs:manage", group: "Platform" },
  { to: "/admin/signups", label: "Signups", icon: "mail", requires: "platform:orgs:manage", area: "signups", group: "Platform" },
  { to: "/admin/users", label: "Users", icon: "user-cog", requires: "platform:users:manage", area: "users", group: "Platform" },
  { to: "/admin/orgs", label: "Organizations", icon: "building", requires: "platform:orgs:manage", area: "orgs", group: "Platform" },
  { to: "/admin/roles", label: "Role Permissions", icon: "lock", requires: "platform:roles:configure", area: "roles", group: "Platform" },
  { to: "/admin/staff", label: "Staff", icon: "users", requiresStaffTier: ["owner", "head"], group: "Platform" },
  { to: "/admin/upgrades", label: "Upgrade requests", icon: "trend", requiresStaffTier: ["owner", "head", "member"], area: "upgrades", group: "Platform" },
  { to: "/admin/billing", label: "Billing", icon: "credit-card", requires: "platform:billing:manage", area: "orgs", group: "Platform" },
  { to: "/admin/audit", label: "Audit Log", icon: "shield", requires: "platform:audit:read:cross-org", area: "orgs", group: "Platform" },
  { to: "/admin/usage", label: "Usage", icon: "barChart", requires: "platform:orgs:manage", area: "orgs", group: "Platform" },
  { to: "/admin/support", label: "Support", icon: "mail", requires: "platform:orgs:manage", group: "Platform" },
  { to: "/admin/settings", label: "Settings", icon: "sliders", requires: "platform:settings:manage", area: "orgs", group: "Platform" },
  { to: "/admin/branding", label: "Branding", icon: "sliders", requires: "platform:orgs:manage", group: "Platform" },
  { to: "/admin/audit-v2", label: "Audit v2 (immutable)", icon: "shield", requires: "platform:audit:read:cross-org", area: "orgs", group: "Platform" },

  // Always visible — every signed-in user can manage their own account security (2FA).
  { to: "/settings/security", label: "Security", icon: "lock", group: "Account" },
  { to: "/help", label: "Help Guide", icon: "info", group: "Account" },

  { to: "/kiosk/labour", label: "Labour Kiosk", icon: "users", group: "Kiosks" },
  { to: "/kiosk/site", label: "Site Wall", icon: "dashboard", group: "Kiosks" },
  { to: "/kiosk/ar", label: "AR Overlay", icon: "camera", group: "Kiosks" },
  { to: "/kiosk/snapshot", label: "Daily Snapshot", icon: "barChart", group: "Kiosks" },
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
  const tier = session.user.staffTier ?? null;
  const isMember = tier === "member";
  const areas = session.user.staffAreas ?? [];
  return NAV_CATALOG.filter(item =>
    (!item.requires || caps.has(item.requires)) &&
    (!item.requiresStaffTier || (tier !== null && item.requiresStaffTier.includes(tier))) &&
    // A staff MEMBER only sees admin items for areas they're granted (owner/head
    // are not members, so they see everything). Empty grants = full access (the
    // default), matching useHasStaffArea + the set_staff_areas RPC semantics.
    (!item.area || !isMember || areas.length === 0 || areas.includes(item.area)),
  );
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
