// SiteTrack Pro — top-level ErrorBoundary (Session 21).
//
// Without this, any uncaught render error (a lazy-chunk load failure, a null
// deref in a tab, a Rules-of-Hooks violation in a new feature) blows the
// entire page to white — exactly the symptom the user hit before the
// Session 21 fix.
//
// This catches all of them, renders an actionable fallback, and exposes a
// "Reload + clear" button that wipes the localStorage cache so corrupt state
// can't keep crashing the app on every reload.

import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Production hook: wire Sentry here when the post-launch monitoring
    // MCP is connected (see docs/MCP_TOOLKIT.md Part C).
    // eslint-disable-next-line no-console
    console.error("SiteTrack uncaught error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const reloadOnly = () => window.location.reload();
    const clearAndReload = () => {
      try {
        localStorage.removeItem("sitetrack_v2");
        sessionStorage.clear();
      } catch { /* ignore */ }
      window.location.reload();
    };

    return (
      <div style={{
        minHeight: "100vh",
        background: "#fffaf0",
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          maxWidth: 520,
          background: "white",
          borderRadius: 24,
          padding: 40,
          border: "1px solid rgba(28,25,23,.08)",
          boxShadow: "0 30px 80px rgba(28,25,23,.08)",
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "#d97706",
            marginBottom: 16,
          }}>— Something broke</div>

          <h1 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 36,
            fontWeight: 300,
            letterSpacing: "-0.02em",
            color: "#1c1917",
            lineHeight: 1.1,
            marginBottom: 16,
          }}>
            We caught an error before it spread.
          </h1>

          <p style={{ fontSize: 15, color: "#44403c", marginBottom: 24, lineHeight: 1.55 }}>
            Reload usually fixes it. If it keeps happening, "Reload and clear data"
            wipes this browser's cache — your work stays safe on the server (if
            you've connected Supabase). Local-mode data will be lost.
          </p>

          {this.state.error?.message && (
            <pre style={{
              background: "#fef6e2",
              padding: 14,
              borderRadius: 10,
              fontSize: 12,
              color: "#78716c",
              overflowX: "auto",
              marginBottom: 24,
              border: "1px solid rgba(28,25,23,.06)",
              fontFamily: "ui-monospace, Menlo, monospace",
            }}>
              {String(this.state.error.message).slice(0, 240)}
            </pre>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={reloadOnly} style={{
              padding: "12px 22px",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "white",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}>Reload</button>
            <button onClick={clearAndReload} style={{
              padding: "12px 22px",
              background: "white",
              color: "#1c1917",
              border: "1px solid rgba(28,25,23,.15)",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}>Reload and clear data</button>
          </div>

          <p style={{ fontSize: 11, color: "#a8a29e", marginTop: 24, lineHeight: 1.5 }}>
            If you keep hitting this screen, email a copy of the box above to{" "}
            <a href="mailto:hello@sitetrack.in" style={{ color: "#d97706" }}>hello@sitetrack.in</a>.
          </p>
        </div>
      </div>
    );
  }
}
