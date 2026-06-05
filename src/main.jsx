import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AppV3 } from "./app/AppV3.tsx";
import { ErrorBoundary } from "./components/errorBoundary.jsx";
import { initSentry } from "./lib/sentry.js";
import "./index.css";

// Session 27.4: kick off Sentry init early. No-op if VITE_SENTRY_DSN unset,
// so demo mode + tests are not affected. Promise is intentionally NOT awaited
// — we don't want to block first paint on a monitoring SDK load.
initSentry();

// ── v3 TypeScript shell is now the DEFAULT (soft cutover, 2026-06-04) ────────
// The new TS shell (src/app/AppV3) mounts by default. The legacy App.jsx is
// kept as a fallback for surfaces v3 hasn't ported yet (most detail tabs,
// org/admin panels, mid-size views) — reachable via ?shell=legacy until v3
// hits feature parity, at which point App.jsx gets deleted.
//
//   (default)      → the new v3 shell
//   ?shell=legacy  → switch to the legacy app + remember the choice
//   ?shell=v3      → switch back to v3 + forget the legacy choice
//
// The choice is persisted to localStorage so React Router navigation (which
// drops the query param) doesn't bounce the user on reload.
const SHELL_KEY = "sitetrack:shell";
function resolveShell() {
  try {
    const params = new URLSearchParams(window.location.search);
    const param = params.get("shell");
    if (param === "legacy") { localStorage.setItem(SHELL_KEY, "legacy"); return "legacy"; }
    if (param === "v3") { localStorage.removeItem(SHELL_KEY); return "v3"; }
    return localStorage.getItem(SHELL_KEY) === "legacy" ? "legacy" : "v3";
  } catch {
    return "v3";
  }
}

const useV3 = resolveShell() === "v3";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Session 21: top-level ErrorBoundary catches lazy-chunk load failures,
        null derefs, Rules-of-Hooks bugs in new features — so a single broken
        feature can no longer render the entire app as a white screen.
        Session 27.4: ErrorBoundary.componentDidCatch reports via Sentry when
        configured. */}
    <ErrorBoundary>
      {useV3 ? <AppV3 /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
