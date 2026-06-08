// SiteTrack Pro — v3 shell top bar.

import { Link } from "react-router-dom";

import { useAuth, useOrgSwitcher } from "@/auth";
import { ROLE_LABEL } from "@/auth";
import { Icon, Button, Avatar } from "@/components/ui/atoms";

export function TopBar(): JSX.Element {
  const { session } = useAuth();
  const { orgs, activeOrg, switchOrg } = useOrgSwitcher();

  const onSignOut = async () => {
    try {
      const mod = await import("../../lib/supabase.js");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mod as any).signOut();
    } finally {
      window.location.href = "/?shell=v3";
    }
  };

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-cream-200 bg-white z-20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-safety-500 text-white grid place-items-center font-bold text-sm">S</div>
        <span className="font-display font-bold text-ink-900 text-sm tracking-tight">SiteTrack Pro</span>
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-600 bg-safety-50 px-1.5 py-0.5 rounded">v3</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Org switcher — only shown when the user belongs to 2+ orgs */}
        {orgs.length > 1 && (
          <select
            value={activeOrg?.orgId ?? ""}
            onChange={e => switchOrg(e.target.value)}
            className="text-xs border border-cream-200 rounded-lg px-2 py-1.5 bg-white text-ink-700 outline-none focus:border-safety-500"
            aria-label="Switch organization"
          >
            {orgs.map(o => (
              <option key={o.orgId} value={o.orgId}>{o.orgName}</option>
            ))}
          </select>
        )}
        {orgs.length === 1 && activeOrg && (
          <span className="text-xs text-ink-600 font-medium hidden sm:inline">{activeOrg.orgName}</span>
        )}

        {/* User chip → click to view / edit your profile */}
        {session && (
          <Link to="/settings/profile" title="View your profile" className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-cream-100 transition">
            <Avatar initials={session.user.name} size="sm" role={session.user.identityRole} />
            <div className="hidden md:block text-right leading-tight">
              <div className="text-xs font-semibold text-ink-800">{session.user.name}</div>
              <div className="text-[10px] text-ink-500">{ROLE_LABEL[session.user.identityRole]}</div>
            </div>
          </Link>
        )}

        <Button variant="ghost" size="sm" onClick={onSignOut} leftIcon={<Icon name="logout" size={14} />}>
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
