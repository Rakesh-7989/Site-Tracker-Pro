import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ErrorBoundary } from "./components/errorBoundary.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Session 21: top-level ErrorBoundary catches lazy-chunk load failures,
        null derefs, Rules-of-Hooks bugs in new features — so a single broken
        feature can no longer render the entire app as a white screen. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
