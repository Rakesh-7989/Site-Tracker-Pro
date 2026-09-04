// SiteTrack Pro — v3 shell top bar.

import { Link } from "react-router-dom";

import { useAuth, useOrgSwitcher } from "@/auth";
import { ROLE_LABEL } from "@/auth";
import { Icon, Button, Avatar } from "@/components/ui/atoms";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import { GlobalSearch } from "./GlobalSearch";
import { TrialBanner } from "./TrialBanner";
import { useConnectionStatus } from "@/lib/platform/useConnectionStatus";
import { useOrgBranding } from "./useOrgBranding";

export function TopBar({ onMenuToggle }: { onMenuToggle: () => void }): JSX.Element {
  const { session } = useAuth();
  const { orgs, activeOrg, switchOrg } = useOrgSwitcher();
  const t = useT();
  const { online, pendingOps, conn } = useConnectionStatus();
  const brand = useOrgBranding(activeOrg?.orgId);
  const displayName = activeOrg?.orgName ?? (orgs.length <= 1 ? brand.tagline : "SiteTrack Pro");

  const onSignOut = async () => {
    try {
      const mod = await import("../../lib/supabase/supabase");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mod as any).signOut();
    } finally {
      window.location.href = "/?shell=v3";
    }
  };

  return (
    <header className="h-12 shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 border-b border-default bg-panel z-20 safe-area-top">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button onClick={onMenuToggle} className="lg:hidden p-1.5 -ml-1 rounded-lg text-fg-secondary hover:bg-secondary transition" aria-label="Toggle navigation menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="w-7 h-7 rounded-lg bg-accent text-white grid place-items-center font-bold text-sm overflow-hidden flex-shrink-0">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            (displayName[0] ?? "S").toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-fg-primary text-sm tracking-tight truncate">{displayName}</div>
          {orgs.length <= 1 && brand.hasCustom && (
            <div className="text-[10px] text-fg-tertiary truncate">{brand.tagline}</div>
          )}
        </div>
        <span className="hidden lg:inline text-[10px] font-semibold tracking-[0.18em] uppercase text-accent bg-accent-tint px-1.5 py-0.5 rounded-md">v3</span>

        {/* Offline / queue pill */}
        {!online && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 bg-error-tint text-error" title={`${pendingOps} ops queued`}>
            ● Offline {pendingOps > 0 && `(${pendingOps})`}
          </div>
        )}
        {online && pendingOps > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 bg-bg-secondary text-warning" title="Backend not connected; ops stay queued locally">
            ↻ {pendingOps} queued
          </div>
        )}

        {/* Backend connection pill — secondary status, hidden below lg to save header space */}
        {conn.state !== "unknown" && (
          <button
            onClick={() => alert(`Connection state: ${conn.state}\n\n${conn.detail || "No additional details."}`)}
            className={`hidden lg:flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 cursor-pointer ${
              conn.state === "live" ? "bg-success-tint text-success" :
              conn.state === "off" ? "bg-bg-secondary text-fg-primary" :
              conn.state === "degraded" ? "bg-bg-secondary text-warning" :
              "bg-error-tint text-error"
            }`}
            title={`Backend: ${conn.state} — ${conn.detail || "OK"}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              conn.state === "live" ? "bg-success" :
              conn.state === "off" ? "bg-ink" :
              conn.state === "degraded" ? "bg-accent" :
              "bg-error"
            }`} />
            {conn.state === "live" ? "DB Live" :
             conn.state === "off" ? "Local mode" :
             conn.state === "degraded" ? "DB degraded" :
             "DB offline"}
          </button>
        )}
      </div>

      {/* Global search — lg+ only; below lg the drawer nav + /search page serve mobile/tablet */}
      <div className="hidden lg:flex flex-1 justify-center px-4 min-w-0">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        {/* Org switcher — only shown when the user belongs to 2+ active orgs */}
        {orgs.length > 1 && (
          <div className="relative min-w-0">
            <select
              value={activeOrg?.orgId ?? ""}
              onChange={e => switchOrg(e.target.value)}
              className="max-w-[7.5rem] sm:max-w-none text-xs border border-default rounded-lg px-2 py-1.5 bg-panel text-fg-primary outline-none focus:border-accent pr-6 truncate"
              aria-label={t("shell.switchOrg")}
            >
              {orgs.map(o => (
                <option key={o.orgId} value={o.orgId}>
                  {o.orgName} {o.segment && `· ${o.segment}`}
                </option>
              ))}
            </select>
            <Link
              to="/settings/orgs"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-fg-tertiary hover:text-fg-primary"
              title={t("shell.manageOrgs")}
            >
              {t("shell.manageOrgs")}
            </Link>
          </div>
        )}
        {orgs.length === 1 && activeOrg && (
          <span className="text-xs text-fg-secondary font-medium hidden sm:inline">{activeOrg.orgName}</span>
        )}

        <TrialBanner />

        <LanguageSwitcher />

        {/* User chip → click to view / edit your profile */}
        {session && (
          <Link to="/settings/profile" title={t("shell.viewProfile")} className="flex-shrink-0 flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-secondary transition">
            <Avatar initials={session.user.name} size="sm" role={session.user.identityRole} />
            <div className="hidden xl:block text-right leading-tight">
              <div className="text-xs font-semibold text-fg-primary">{session.user.name}</div>
              <div className="text-[10px] text-fg-secondary">{ROLE_LABEL[session.user.identityRole]}</div>
            </div>
          </Link>
        )}

        <Button variant="ghost" size="sm" onClick={onSignOut} leftIcon={<Icon name="logout" size={14} />}>
          <span className="hidden lg:inline">{t("shell.signOut")}</span>
        </Button>
      </div>
    </header>
  );
}
