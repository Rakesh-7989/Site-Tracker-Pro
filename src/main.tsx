import React from "react";
import ReactDOM from "react-dom/client";
import { AppV3 } from "./app/AppV3";
import { ErrorBoundary } from "./components/errorBoundary";

import { initSentry } from "./lib/sentry";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";

initSentry();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppV3 />
    </ErrorBoundary>
  </React.StrictMode>
);
