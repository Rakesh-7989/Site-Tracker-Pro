// SiteTrack Pro — v3 shell layout (TopBar + Sidebar + routed content).
//
// Wraps the authenticated area. Renders the loading / signed-out / error
// states via RequireSession, then the chrome + <Outlet/> for child routes.

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";

import { RequireSession, useAuth } from "@/auth";
import { Spinner } from "@/components/ui/atoms";
import { isNativeMobile, getPlatform } from "@/lib/platform/platform";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { BrandingEffect } from "./BrandingEffect";
import { SubdomainBranding } from "./SubdomainBranding";
import { SubscriptionBanner } from "@/features/org/SubscriptionBanner";
import { ImpersonationBanner } from "@/features/admin/ImpersonationBanner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSwipe } from "@/hooks/useSwipe";

function FullScreenSpinner(): JSX.Element {
  return (
    <div className="min-h-screen grid place-items-center bg-panel text-accent">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={28} />
        <span className="text-sm text-fg-secondary">Loading your workspace…</span>
      </div>
    </div>
  );
}

export function ShellLayout(): JSX.Element {
  const location = useLocation();
  const { error } = useAuth();
  const loginPath = location.pathname.startsWith("/admin") ? "/staff/login" : "/login";
  const errParam = error ? `?error=session&detail=${encodeURIComponent(error.slice(0, 80))}` : "?error=session";
  return (
    <RequireSession
      loading={<FullScreenSpinner />}
      signedOut={<Navigate to={loginPath} replace />}
      errorView={<Navigate to={`${loginPath}${errParam}`} replace />}
    >
      <GatedShell />
    </RequireSession>
  );
}

/**
 * Inside a ready session: force profile completion first (every user fills it
 * once — migration 102), then render the app chrome.
 */
function GatedShell(): JSX.Element {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const mainRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  // Android hardware BACK: drawer first, then router history; at the root the
  // handler returns false and native.ts exits the app.
  useEffect(() => {
    if (!isNativeMobile() || getPlatform() !== "android") return;
    let dispose = () => {};
    let cancelled = false;
    void (async () => {
      const { attachAndroidBackButton } = await import("@/lib/platform/native");
      if (cancelled) return;
      dispose = await attachAndroidBackButton(() => {
        if (mobileOpen) { setMobileOpen(false); return true; }
        if (window.history.length > 1) { navigate(-1); return true; }
        return false;
      });
    })();
    return () => { cancelled = true; dispose(); };
  }, [mobileOpen, navigate]);

  const openSidebar = useCallback(() => setMobileOpen(true), []);
  const closeSidebar = useCallback(() => setMobileOpen(false), []);

  useSwipe(mainRef, { edgeSize: 40, onSwipeRight: mobileOpen ? undefined : openSidebar });
  useSwipe(sidebarRef, { onSwipeLeft: mobileOpen ? closeSidebar : undefined });
  if (session && session.user.profileCompleted === false) {
    return <Navigate to="/profile/complete" replace />;
  }
  return (
    /* Applied per-org branding (accent CSS vars + dynamic title) and once-on-subdomain
       white-label branding (subdomain→org mapping + title + accent vars). */
      <div className="h-screen flex flex-col bg-panel overflow-hidden">
        <BrandingEffect />
        <SubdomainBranding />
        <ImpersonationBanner />
        <TopBar onMenuToggle={() => setMobileOpen(v => !v)} />
        <SubscriptionBanner />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <Sidebar mobileOpen={mobileOpen} onClose={closeSidebar} sidebarRef={sidebarRef} />
          <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6 pb-16 lg:pb-6 xl:mx-auto xl:w-full xl:max-w-7xl">
            <Suspense fallback={<div className="grid place-items-center py-20 text-accent"><Spinner size={24} /></div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <BottomNav />
      </div>
  );
}
