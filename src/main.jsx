import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ErrorBoundary } from "./components/errorBoundary.jsx";
import { initSentry } from "./lib/sentry.js";
import "./index.css";

// Session 27.4: kick off Sentry init early. No-op if VITE_SENTRY_DSN unset,
// so demo mode + tests are not affected. Promise is intentionally NOT awaited
// — we don't want to block first paint on a monitoring SDK load.
initSentry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Session 21: top-level ErrorBoundary catches lazy-chunk load failures,
        null derefs, Rules-of-Hooks bugs in new features — so a single broken
        feature can no longer render the entire app as a white screen.
        Session 27.4: ErrorBoundary.componentDidCatch reports via Sentry when
        configured. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
