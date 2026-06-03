// SiteTrack Pro — v3 role-aware sidebar.
//
// Renders the nav items the current session's capabilities unlock,
// grouped by section. The active route is highlighted via NavLink.

import { NavLink } from "react-router-dom";

import { useAuth } from "@/auth";
import { buildNav, groupNav } from "@/app/nav-config";
import { Icon } from "@/components/ui/atoms";

export function Sidebar(): JSX.Element {
  const { session } = useAuth();
  const groups = groupNav(buildNav(session));

  return (
    <nav className="w-56 shrink-0 border-r border-cream-200 bg-white overflow-y-auto hidden lg:block">
      <div className="p-3 space-y-5">
        {groups.map(({ group, items }) => (
          <div key={group}>
            {group && (
              <div className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-400">
                {group}
              </div>
            )}
            <div className="space-y-0.5">
              {items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/dashboard"}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                      isActive
                        ? "bg-safety-50 text-safety-700 font-semibold"
                        : "text-ink-600 hover:bg-cream-100"
                    }`
                  }
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
