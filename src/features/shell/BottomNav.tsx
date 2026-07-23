import { NavLink } from "react-router-dom";
import { Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
}

const ITEMS: NavItem[] = [
  { to: "/dashboard", icon: "dashboard", label: "Home" },
  { to: "/projects", icon: "building", label: "Projects" },
  { to: "/calendar", icon: "calendar", label: "Calendar" },
  { to: "/messages", icon: "msgcircle", label: "Messages" },
  { to: "/settings/profile", icon: "user", label: "Profile" },
];

export function BottomNav(): JSX.Element {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-cream-200 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1">
        {ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition min-w-0 ${
                isActive
                  ? "text-safety-600"
                  : "text-ink-400 hover:text-ink-600"
              }`
            }
          >
            <Icon name={item.icon} size={20} />
            <span className="text-[10px] font-semibold leading-tight">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
