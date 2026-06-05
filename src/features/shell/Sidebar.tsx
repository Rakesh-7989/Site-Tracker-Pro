// SiteTrack Pro — v3 role-aware sidebar.
//
// Renders the nav items the current session's capabilities unlock,
// grouped by section. The active route is highlighted via NavLink.

import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { useAuth, useCan } from "@/auth";
import { buildNav, groupNav } from "@/app/nav-config";
import { pendingSignupCount } from "@/app/signupAdminQueries";
import { Icon } from "@/components/ui/atoms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }

export function Sidebar(): JSX.Element {
  const { session } = useAuth();
  const groups = groupNav(buildNav(session));
  const isSuper = useCan("platform:orgs:manage");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!isSuper) return;
    let alive = true;
    void (async () => {
      const client = await getClient(); if (!client) return;
      const n = await pendingSignupCount(client);
      if (alive) setPending(n);
    })();
    return () => { alive = false; };
  }, [isSuper]);

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
                  end={item.to === "/dashboard" || item.to === "/admin"}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                      isActive
                        ? "bg-safety-50 text-safety-700 font-semibold"
                        : "text-ink-600 hover:bg-cream-100"
                    }`
                  }
                >
                  <Icon name={item.icon} size={16} />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/admin/signups" && pending > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-safety-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{pending}</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
