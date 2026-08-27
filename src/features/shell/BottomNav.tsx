import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth";
import { buildNav } from "@/app/config/nav-config";
import { Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
}

const ALL_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: "dashboard", label: "Home" },
  { to: "/projects", icon: "building", label: "Projects" },
  { to: "/calendar", icon: "calendar", label: "Calendar" },
  { to: "/chat", icon: "msgcircle", label: "Chat" },
  { to: "/settings/profile", icon: "user", label: "Profile" },
];

export function BottomNav(): JSX.Element {
  const { session } = useAuth();
  const allowedRoutes = useMemo(() => {
    if (!session) return new Set<string>();
    const nav = buildNav(session);
    const routes = new Set<string>();
    const walk = (items: Array<{ to?: string; children?: Array<{ to?: string }> }>) => {
      for (const item of items) {
        if (item.to) routes.add(item.to);
        if (item.children) walk(item.children);
      }
    };
    walk(nav);
    return routes;
  }, [session]);

  const items = useMemo(() => ALL_ITEMS.filter(item => allowedRoutes.has(item.to)), [allowedRoutes]);

  if (items.length === 0) return <></>;
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-panel border-t border-default safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1 overflow-x-auto scrollbar-hide">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-lg transition shrink-0 ${
                isActive
                  ? "text-accent"
                  : "text-fg-tertiary hover:text-fg-secondary"
              }`
            }
          >
            <Icon name={item.icon} size={20} />
            <span className="text-[10px] font-semibold leading-tight whitespace-nowrap">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
