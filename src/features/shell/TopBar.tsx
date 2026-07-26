// SiteTrack Pro — v3 shell top bar.

import { Link } from "react-router-dom";

import { useAuth, useOrgSwitcher } from "@/auth";
import { ROLE_LABEL } from "@/auth";
import { Icon, Button, Avatar } from "@/components/ui/atoms";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import { GlobalSearch } from "./GlobalSearch";
import { useConnectionStatus } from "@/lib/useConnectionStatus";

export function TopBar({ onMenuToggle }: { onMenuToggle: () => void }): JSX.Element {
  const { session } = useAuth();
  const { orgs, activeOrg, switchOrg } = useOrgSwitcher();
  const t = useT();
  const { online, pendingOps, conn } = useConnectionStatus();

  const onSignOut = async () => {
    try {
      const mod = await import("../../lib/supabase");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mod as any).signOut();
    } finally {
      window.location.href = "/?shell=v3";
    }
  };

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-cream-200 bg-white z-20 safe-area-top">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden p-1.5 -ml-1 rounded-lg text-ink-600 hover:bg-cream-100 transition" aria-label="Toggle navigation menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="w-8 h-8 rounded-lg bg-safety-500 text-white grid place-items-center font-bold text-sm">S</div>
        <span className="font-display font-bold text-ink-900 text-sm tracking-tight">SiteTrack Pro</span>
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-600 bg-safety-50 px-1.5 py-0.5 rounded">v3</span>

        {/* Offline / queue pill */}
        {!online && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 bg-rose-50 text-rose-700" title={`${pendingOps} ops queued`}>
            ● Offline {pendingOps > 0 && `(${pendingOps})`}
          </div>
        )}
        {online && pendingOps > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 bg-amber-50 text-amber-800" title="Backend not connected; ops stay queued locally">
            ↻ {pendingOps} queued
          </div>
        )}

        {/* Backend connection pill */}
        {conn.state !== "unknown" && (
          <button
            onClick={() => alert(`Connection state: ${conn.state}\n\n${conn.detail || "No additional details."}`)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 cursor-pointer ${
              conn.state === "live" ? "bg-emerald-50 text-emerald-700" :
              conn.state === "off" ? "bg-cream-200 text-ink-700" :
              conn.state === "degraded" ? "bg-amber-50 text-amber-800" :
              "bg-rose-50 text-rose-700"
            }`}
            title={`Backend: ${conn.state} — ${conn.detail || "OK"}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              conn.state === "live" ? "bg-emerald-500" :
              conn.state === "off" ? "bg-ink-500" :
              conn.state === "degraded" ? "bg-amber-500" :
              "bg-rose-500"
            }`} />
            {conn.state === "live" ? "DB Live" :
             conn.state === "off" ? "Local mode" :
             conn.state === "degraded" ? "DB degraded" :
             "DB offline"}
          </button>
        )}
      </div>

      <div className="flex-1 flex justify-center px-4">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        {/* Org switcher — only shown when the user belongs to 2+ orgs */}
        {orgs.length > 1 && (
          <select
            value={activeOrg?.orgId ?? ""}
            onChange={e => switchOrg(e.target.value)}
            className="text-xs border border-cream-200 rounded-lg px-2 py-1.5 bg-white text-ink-700 outline-none focus:border-safety-500"
            aria-label={t("shell.switchOrg")}
          >
            {orgs.map(o => (
              <option key={o.orgId} value={o.orgId}>{o.orgName}</option>
            ))}
          </select>
        )}
        {orgs.length === 1 && activeOrg && (
          <span className="text-xs text-ink-600 font-medium hidden sm:inline">{activeOrg.orgName}</span>
        )}

        <LanguageSwitcher />

        {/* User chip → click to view / edit your profile */}
        {session && (
          <Link to="/settings/profile" title={t("shell.viewProfile")} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-cream-100 transition">
            <Avatar initials={session.user.name} size="sm" role={session.user.identityRole} />
            <div className="hidden md:block text-right leading-tight">
              <div className="text-xs font-semibold text-ink-800">{session.user.name}</div>
              <div className="text-[10px] text-ink-500">{ROLE_LABEL[session.user.identityRole]}</div>
            </div>
          </Link>
        )}

        <Button variant="ghost" size="sm" onClick={onSignOut} leftIcon={<Icon name="logout" size={14} />}>
          <span className="hidden sm:inline">{t("shell.signOut")}</span>
        </Button>
      </div>
    </header>
  );
}
