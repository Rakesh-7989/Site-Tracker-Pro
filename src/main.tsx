import React from "react";
import ReactDOM from "react-dom/client";
import { AppV3 } from "./app/AppV3";
import { ErrorBoundary } from "./components/errorBoundary";

import { initSentry } from "./lib/sentry";
import { registerServiceWorker } from "./lib/pwa";
import { isNativeMobile } from "./lib/platform";
import "./index.css";

initSentry();
// The web service worker is web-PWA-only: inside the Capacitor shell the
// native layer owns caching/offline (documented in MOBILE_BUILD.md).
if (!isNativeMobile()) registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppV3 />
    </ErrorBoundary>
  </React.StrictMode>
);
