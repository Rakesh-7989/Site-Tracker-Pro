import React from "react";
import { captureException } from "../lib/sentry";
import { Button } from "@/components/ui/atoms";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: { componentStack?: string } | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ info: { componentStack: info?.componentStack ?? undefined } });
    captureException(error, { extra: { componentStack: info?.componentStack } });
    console.error("SiteTrack uncaught error:", error, info?.componentStack);
  }

  override render() {
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
      <div className="min-h-screen bg-cream-50 font-sans flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-cream-200 shadow-editorial-deep p-8 md:p-10">
          <div className="text-[11px] font-bold tracking-[0.28em] uppercase text-safety-500 mb-4">
            — Something broke
          </div>

          <h1 className="font-display text-3xl font-light tracking-editorial text-ink-900 leading-tight mb-4">
            We caught an error before it spread.
          </h1>

          <p className="text-sm text-ink-600 mb-6 leading-relaxed">
            Reload usually fixes it. If it keeps happening, "Reload and clear data"
            wipes this browser's cache — your work stays safe on the server (if
            you've connected Supabase). Local-mode data will be lost.
          </p>

          {this.state.error?.message && (
            <pre className="bg-saffron-tint p-3.5 rounded-xl text-xs text-ink-500 overflow-x-auto mb-6 border border-cream-200 font-mono">
              {String(this.state.error.message).slice(0, 240)}
            </pre>
          )}

          <div className="flex gap-2.5 flex-wrap">
            <Button onClick={reloadOnly}>Reload</Button>
            <Button variant="secondary" onClick={clearAndReload}>Reload and clear data</Button>
          </div>

          <p className="text-[11px] text-ink-400 mt-6 leading-relaxed">
            If you keep hitting this screen, email a copy of the box above to{" "}
            <a href={`mailto:boyapatirakesh7777@gmail.com`} className="text-safety-500 hover:text-safety-600">boyapatirakesh7777@gmail.com</a>.
          </p>
        </div>
      </div>
    );
  }
}
