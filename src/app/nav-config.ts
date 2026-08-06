// SiteTrack Pro — role-aware navigation config (pure, testable).
//
// Maps the capability set (from @/auth RoleResolver) to the list of nav
// items a user should see. The Sidebar renders whatever buildNav returns.
// Keeping this pure means we can unit-test "what does an architect see
// vs a client" without rendering React.

import type { AuthSession } from "@/auth";
import { capabilitiesAnywhere } from "@/auth";
import type { Capability } from "@/auth";
import type { CompanySegment } from "@/auth";
import type { IconName } from "@/components/ui/icons";
import type { ModuleId } from "@/modules";

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
  /** Any of these capabilities unlocks the item. Overrides `requires` when set. */
  requiresAny?: ReadonlyArray<Capability>;
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
  /**
   * Sprint 1 feature freeze: when set, the item is hidden from non-staff users.
   * The value is the STUB_VIEWS id from src/lib/featureFlags.js.
   */
  stubId?: string;
  /**
   * v4 company-segment gate (migration 134). When set, the item is shown ONLY
   * to orgs whose segment is in this list. Orthogonal to `requires` — both
   * must pass. Absent = visible to every segment. When the active org has no
   * segment (legacy orgs), segment-gated items stay hidden.
   */
  segments?: ReadonlyArray<CompanySegment>;
  /**
   * v4 module gate (migration 155). When set, the item requires AT LEAST ONE
   * of these modules to be enabled on the active org. Orthogonal to
   * `requires`/`segments` — all must pass. Absent = no module gate. When the
   * active org hasn't configured enabled_modules (legacy org), module-gated
   * items stay visible (back-compat).
   */
  modules?: ReadonlyArray<ModuleId>;
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
    { to: "/client", label: "Client Portal", icon: "shield", requires: "share:client:portal", group: "Workspace", segments: ["architecture", "interior", "multiple"], modules: ["clients"] },
  { to: "/pm", label: "PM Dashboard", icon: "hardhat", requires: "project:create", group: "Workspace" },
  { to: "/vendor", label: "Vendor Portal", icon: "truck", requires: "po:create", group: "Workspace", modules: ["procurement"] },
  { to: "/projects/new", label: "New Project", icon: "plus", requires: "project:create", group: "Workspace" },

  { to: "/dpr", label: "Daily Reports", icon: "clipboard", requires: "dpr:view", group: "Field", modules: ["site_ops"] },
  { to: "/compliance", label: "Compliance", icon: "shield", requires: "compliance:view", group: "Field", modules: ["compliance"] },
  { to: "/digest", label: "Digest Subs", icon: "bell", requires: "digest:subscribe", group: "Field" },
  { to: "/handover", label: "Handover Packet", icon: "doc", requires: "handover:view", group: "Field", modules: ["site_ops", "clients"] },
  { to: "/worklogs", label: "Worklogs", icon: "clipboard", requires: "labour:manage", group: "Field", modules: ["people"] },
  { to: "/equipment", label: "Equipment", icon: "truck", requires: "material:add", group: "Field", modules: ["procurement"] },
  { to: "/measurement-book", label: "Measurement Book", icon: "doc", requiresAny: ["boq:edit", "progress:edit"], group: "Field", modules: ["site_ops"] },

  { to: "/vendors", label: "Vendors", icon: "truck", requires: "vendor:manage", group: "Procurement", modules: ["procurement"] },
  { to: "/procurement", label: "Procurement", icon: "wallet", requires: "procurement:view", segments: ["architecture", "interior", "multiple"], group: "Procurement", modules: ["procurement"] },
  { to: "/ffe", label: "FF&E Rollup", icon: "hardhat", requires: "ffe:manage", segments: ["architecture", "interior", "multiple"], group: "Procurement", modules: ["design"] },
  { to: "/download-audit", label: "Download Audit", icon: "download", requiresAny: ["deliverable:manage", "deliverable:approve", "drawings:upload"], group: "Insights", modules: ["consultancy", "design"] },
  { to: "/pos", label: "Purchase Orders", icon: "doc", requiresAny: ["po:create", "material:add"], group: "Procurement", modules: ["procurement"] },
  { to: "/rabills", label: "RA Bills", icon: "wallet", requires: "rabill:create", group: "Procurement", modules: ["finance"] },
   { to: "/material-prices", label: "Material Prices", icon: "truck", requires: "material:price:view", group: "Procurement", modules: ["procurement"] },
   { to: "/hierarchy", label: "Hierarchy", icon: "building", requiresAny: ["project:create", "budget:view"], group: "Planning", modules: ["people"] },
   { to: "/forecast", label: "Cost Forecast", icon: "barChart", requires: "budget:view", group: "Insights", modules: ["insights"] },
   { to: "/delegations", label: "Delegations", icon: "users", requires: "org:approvals:manage", group: "Org Admin" },

  { to: "/analytics", label: "Analytics", icon: "barChart", requires: "budget:view", group: "Insights", modules: ["insights"] },
  { to: "/utilization", label: "Utilization", icon: "trend", requires: "utilization:view", segments: ["consultancy", "architecture", "multiple"], group: "Insights", modules: ["consultancy"] },
  { to: "/revenue", label: "Revenue", icon: "wallet", requires: "revenue:view", segments: ["consultancy", "architecture", "multiple"], group: "Insights", modules: ["finance"] },
  { to: "/activity", label: "Activity", icon: "activity", requires: "activity:view", group: "Insights" },
  { to: "/audit", label: "Audit Log", icon: "shield", requires: "audit:read", group: "Insights" },

  { to: "/org", label: "Org Home", icon: "building", requires: "org:members:manage", group: "Org Admin" },
  { to: "/org/members", label: "Members", icon: "users", requires: "org:members:manage", group: "Org Admin" },
  { to: "/org/roles", label: "Custom Roles", icon: "lock", requires: "org:members:manage", group: "Org Admin" },
  { to: "/org/billing", label: "Billing", icon: "credit-card", requires: "org:billing:manage", group: "Org Admin" },
  { to: "/org/templates", label: "Templates", icon: "doc", requires: "org:templates:manage", group: "Org Admin", stubId: "org-templates" },
  { to: "/org/approvals", label: "Approvals", icon: "check", requires: "org:approvals:manage", group: "Org Admin", stubId: "org-approvals" },
  { to: "/org/notifications", label: "Notifications", icon: "bell", requires: "org:notifications:manage", group: "Org Admin", stubId: "org-notifications" },
  { to: "/org/integrations", label: "Integrations", icon: "plug", requires: "org:integrations:manage", group: "Org Admin", stubId: "org-integrations" },
  { to: "/org/features", label: "Features", icon: "sliders", requires: "org:features:configure", group: "Org Admin", stubId: "org-features" },

  { to: "/admin", label: "Platform", icon: "dashboard", requires: "platform:orgs:manage", group: "Platform" },
  { to: "/admin/signups", label: "Signups", icon: "mail", requires: "platform:orgs:manage", area: "signups", group: "Platform" },
  { to: "/admin/users", label: "Users", icon: "user-cog", requires: "platform:users:manage", area: "users", group: "Platform" },
  { to: "/admin/orgs", label: "Organizations", icon: "building", requires: "platform:orgs:manage", area: "orgs", group: "Platform" },
  { to: "/admin/roles", label: "Role Permissions", icon: "lock", requires: "platform:roles:configure", area: "roles", group: "Platform" },
  { to: "/admin/staff", label: "Staff", icon: "users", requiresStaffTier: ["owner", "head"], group: "Platform" },
  { to: "/admin/upgrades", label: "Upgrade requests", icon: "trend", requiresStaffTier: ["owner", "head", "member"], area: "upgrades", group: "Platform" },
  { to: "/admin/billing", label: "Billing", icon: "credit-card", requires: "platform:billing:manage", area: "orgs", group: "Platform" },
  { to: "/admin/audit", label: "Audit Log", icon: "shield", requires: "platform:audit:read:cross-org", area: "orgs", group: "Platform", stubId: "admin-audit-log" },
  { to: "/admin/usage", label: "Usage", icon: "barChart", requires: "platform:orgs:manage", area: "orgs", group: "Platform" },
  { to: "/admin/support", label: "Support", icon: "mail", requires: "platform:orgs:manage", group: "Platform" },
  { to: "/admin/settings", label: "Settings", icon: "sliders", requires: "platform:settings:manage", area: "orgs", group: "Platform" },
  { to: "/admin/feature-flags", label: "Feature Flags", icon: "flag", requires: "platform:settings:manage", area: "orgs", group: "Platform" },
  { to: "/admin/branding", label: "Branding", icon: "image", requires: "platform:orgs:manage", group: "Platform", stubId: "admin-branding" },
  { to: "/admin/audit-v2", label: "Audit v2 (immutable)", icon: "shield", requires: "platform:audit:read:cross-org", area: "orgs", group: "Platform" },

  // Always visible — every signed-in user can manage their own account security (2FA).
  { to: "/settings/security", label: "Security", icon: "lock", group: "Account" },
  { to: "/help", label: "Help Guide", icon: "info", group: "Account" },

  { to: "/kiosk/labour", label: "Labour Kiosk", icon: "users", group: "Kiosks", stubId: "kiosk-labour", modules: ["kiosks"] },
  { to: "/kiosk/site", label: "Site Wall", icon: "dashboard", group: "Kiosks", stubId: "kiosk-site", modules: ["kiosks"] },
  { to: "/kiosk/ar", label: "AR Overlay", icon: "camera", group: "Kiosks", stubId: "ar-overlay", modules: ["kiosks"] },
  { to: "/kiosk/snapshot", label: "Daily Snapshot", icon: "barChart", group: "Kiosks", stubId: "snapshot", modules: ["kiosks"] },
];

/**
 * Build the nav list a given session can see. Uses the AGGREGATE
 * capability set (across every org + project the user belongs to) so the
 * sidebar shows everything they could reach somewhere — the per-screen
 * guards still re-check with the precise context.
 *
 * @param session   the current auth session (null → empty nav)
 * @param catalog   the nav catalog to filter (defaults to NAV_CATALOG; tests
 *                  inject synthetic segment-gated items)
 */
export function buildNav(session: AuthSession | null, catalog: NavItem[] = NAV_CATALOG): NavItem[] {
  if (!session) return [];
  const caps = capabilitiesAnywhere(session);
  const tier = session.user.staffTier ?? null;
  const isMember = tier === "member";
  const areas = session.user.staffAreas ?? [];

  // Staff check for Sprint 1 stub gating: staff can see frozen stubs,
  // non-staff cannot. Three ways in:
  //   1. isStaff flag (DB profiles.is_staff)
  //   2. superadmin identity role
  //   3. email on VITE_STAFF_EMAILS allowlist (local dev + founder)
  const user = session.user;
  const isStaff = user.isStaff ||
    user.identityRole === "superadmin" ||
    (() => {
      try {
        const env = (typeof import.meta !== "undefined" ? import.meta.env as Record<string, string> : {}) || {};
        const allow = env.VITE_STAFF_EMAILS || "";
        if (!allow) return false;
        const list = String(allow).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const email = String(user.email || "").trim().toLowerCase();
        return email && list.includes(email);
      } catch { return false; }
    })();

  // Active org's segment (migration 134) — segment-gated nav items resolve
  // against this. Legacy orgs (null segment) hide segment-gated items.
  const activeSegment = session.orgs.find(o => o.orgId === session.activeOrgId)?.segment ?? null;

  // Active org's enabled modules (migration 155) — module-gated nav items
  // resolve against this. Legacy orgs (null config) show module-gated items.
  const activeModules = session.orgs.find(o => o.orgId === session.activeOrgId)?.enabledModules ?? null;

  // Client-specific sidebar: group client-visible items under "Client" group
  // This provides a cleaner, role-appropriate sidebar for clients
  const isClient = session.user.identityRole === "client";
  
  // Filter out client-specific items from the catalog for non-clients
  // and reorganize for clients
  const filteredCatalog = catalog.map(item => {
    // Client portal already has segments gate, no need to change group
    if (item.to === "/client") {
      return item;
    }
    
    // Client-visible items that should be grouped under "Client" for client users
    if (isClient && (item.to === "/dpr" || item.to === "/compliance" || item.to === "/handover" || item.to === "/activity")) {
      return { ...item, group: "Client" };
    }
    
    // For non-clients, move client group items back to original groups
    if (!isClient && (item.group === "Client" && (item.to === "/dpr" || item.to === "/compliance" || item.to === "/handover" || item.to === "/activity"))) {
      // Map back to original groups based on capability
      if (item.to === "/dpr") {
        return { ...item, group: "Field" };
      } else if (item.to === "/handover") {
        return { ...item, group: "Field" };
      } else if (item.to === "/compliance") {
        return { ...item, group: "Field" };
      } else if (item.to === "/activity") {
        return { ...item, group: "Insights" };
      }
    }
    
    return item;
  });

  return filteredCatalog.filter(item => {
    const capOk = item.requiresAny
      ? item.requiresAny.some(c => caps.has(c))
      : !item.requires || caps.has(item.requires);
    return capOk &&
    (!item.requiresStaffTier || (tier !== null && item.requiresStaffTier.includes(tier))) &&
    (!item.area || !isMember || areas.length === 0 || areas.includes(item.area)) &&
    (!item.stubId || isStaff) &&
    (!item.segments || (activeSegment !== null && item.segments.includes(activeSegment))) &&
    (!item.modules || activeModules === null || item.modules.some(m => activeModules.includes(m)));
  });
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
