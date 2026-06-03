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

// ── v3 TypeScript shell opt-in (Phase 3 strangler-fig) ──────────────────────
// The new TS shell (src/app/AppV3) mounts ONLY when explicitly opted in.
// The legacy App.jsx remains the production default until the rebuild
// reaches feature parity (Phase 8).
//
//   ?shell=v3      → switch to the new shell + remember the choice
//   ?shell=legacy  → switch back to the legacy app + forget the choice
//
// The choice is persisted to localStorage so React Router navigation (which
// drops the query param) doesn't bounce the user back to legacy on reload.
const SHELL_KEY = "sitetrack:shell";
function resolveShell() {
  try {
    const params = new URLSearchParams(window.location.search);
    const param = params.get("shell");
    if (param === "v3") { localStorage.setItem(SHELL_KEY, "v3"); return "v3"; }
    if (param === "legacy") { localStorage.removeItem(SHELL_KEY); return "legacy"; }
    return localStorage.getItem(SHELL_KEY) === "v3" ? "v3" : "legacy";
  } catch {
    return "legacy";
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
