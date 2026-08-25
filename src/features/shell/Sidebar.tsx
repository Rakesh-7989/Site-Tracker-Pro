// SiteTrack Pro — v3 role-aware sidebar.
import { getClient } from "@/lib/supabase";
//
// Renders the nav items the current session's capabilities unlock,
// grouped by section. The active route is highlighted via NavLink.

import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { useAuth, useCan } from "@/auth";
import { buildNav, groupNav } from "@/app/nav-config";
import { pendingSignupCount } from "@/app/signupAdminQueries";
import { unreadCount } from "@/app/notificationQueries";
import { Icon } from "@/components/ui/atoms";
import { useT } from "@/i18n/I18nProvider";

// Map each nav route → its i18n key (migration: app-wide i18n). Labels fall
// back to the English string baked into nav-config when a key is missing.
const NAV_KEY: Record<string, string> = {
  "/dashboard": "nav.dashboard", "/projects": "nav.projects", "/calendar": "nav.calendar",
  "/search": "nav.search", "/notifications": "nav.notifications", "/projects/new": "nav.newProject",
  "/dpr": "nav.dailyReports", "/vendors": "nav.vendors", "/pos": "nav.purchaseOrders",
  "/analytics": "nav.analytics", "/activity": "nav.activity", "/audit": "nav.auditLog",
  "/org": "nav.orgHome", "/org/members": "nav.members", "/org/roles": "nav.customRoles",
  "/org/billing": "nav.billing", "/org/templates": "nav.templates", "/org/approvals": "nav.orgApprovals",
  "/org/notifications": "nav.orgNotifications", "/org/integrations": "nav.integrations",
  "/admin": "nav.platform", "/admin/signups": "nav.signups", "/admin/users": "nav.users",
  "/admin/orgs": "nav.organizations", "/admin/roles": "nav.rolePermissions", "/admin/staff": "nav.staff",
  "/admin/upgrades": "nav.upgradeRequests", "/settings/security": "nav.security",
};

 

export function Sidebar({ mobileOpen, onClose, sidebarRef }: { mobileOpen: boolean; onClose: () => void; sidebarRef?: React.RefObject<HTMLElement | null> }): JSX.Element {
  const { session } = useAuth();
  const t = useT();
  const groups = groupNav(buildNav(session));
  const isSuper = useCan("platform:orgs:manage");
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const client = await getClient(); if (!client) return;
      const [p, u] = await Promise.all([isSuper ? pendingSignupCount(client) : Promise.resolve(0), unreadCount(client)]);
      if (alive) { setPending(p); setUnread(u); }
    })();
    return () => { alive = false; };
  }, [isSuper]);

  return (
    <>
      {/* Backdrop overlay   fades in/out on mobile */}
      <div className={`fixed inset-0 z-30 bg-ink/60 backdrop-blur-sm lg:hidden transition-opacity duration-200 ease-in-out ${mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={onClose} />

      {/* Sidebar: persistent on desktop (lg:), slide-in drawer on mobile */}
      <nav ref={sidebarRef as React.LegacyRef<HTMLElement>} className={`
        w-56 shrink-0 border-r border-default bg-panel overflow-y-auto
        fixed lg:relative z-40 inset-y-0 left-0
        transform transition-transform duration-200 ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 lg:block
      `}>
        {/* Close button — mobile only */}
        <div className="sticky top-0 bg-panel z-10 flex items-center justify-between px-3 py-2 border-b border-default lg:hidden">
          <span className="text-xs font-semibold tracking-wider uppercase text-fg-tertiary">Menu</span>
          <button onClick={onClose} className="p-1 rounded-lg text-fg-secondary hover:bg-secondary transition" aria-label="Close navigation menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="p-3 space-y-5">
          {groups.map(({ group, items }) => (
            <div key={group}>
              {group && (
                <div className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-tertiary">
                  {t(`navGroup.${group}`)}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/dashboard" || item.to === "/admin"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition ${
                        isActive
                          ? "bg-accent-tint text-accent-2 font-semibold"
                          : "text-fg-secondary hover:bg-secondary"
                      }`
                    }
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="flex-1">{NAV_KEY[item.to] ? t(NAV_KEY[item.to]) : item.label}</span>
                    {item.to === "/admin/signups" && pending > 0 && (
                      <span className="ml-auto text-[10px] font-bold bg-accent text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{pending}</span>
                    )}
                    {item.to === "/notifications" && unread > 0 && (
                      <span className="ml-auto text-[10px] font-bold bg-accent text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{unread}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
