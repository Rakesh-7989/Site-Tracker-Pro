// SiteTrack Pro — v3 shell layout (TopBar + Sidebar + routed content).
//
// Wraps the authenticated area. Renders the loading / signed-out / error
// states via RequireSession, then the chrome + <Outlet/> for child routes.

import { Suspense } from "react";
import { Outlet, Navigate } from "react-router-dom";

import { RequireSession } from "@/auth";
import { Spinner } from "@/components/ui/atoms";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";

function FullScreenSpinner(): JSX.Element {
  return (
    <div className="min-h-screen grid place-items-center bg-cream-50 text-safety-500">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={28} />
        <span className="text-sm text-ink-500">Loading your workspace…</span>
      </div>
    </div>
  );
}

export function ShellLayout(): JSX.Element {
  return (
    <RequireSession
      loading={<FullScreenSpinner />}
      signedOut={<Navigate to="/login" replace />}
      errorView={<Navigate to="/login?error=session" replace />}
    >
      {/* Fixed-height app frame: the TopBar stays put while the Sidebar and the
          main content each scroll on their own (min-h-0 lets the flex children
          actually shrink so their overflow-y-auto kicks in). */}
      <div className="h-screen flex flex-col bg-cream-50 overflow-hidden">
        <TopBar />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
            <Suspense fallback={<div className="grid place-items-center py-20 text-safety-500"><Spinner size={24} /></div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </RequireSession>
  );
}
