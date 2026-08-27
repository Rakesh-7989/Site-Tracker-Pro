// SiteTrack Pro - route-level error boundary.
//
// Wired as `errorElement` on every route (see router.tsx guardRoutes): a crash
// or lazy-chunk failure inside any view renders THIS card inside the nearest
// parent outlet instead of unmounting the whole app. The root class
// ErrorBoundary (components/errorBoundary.tsx) remains the last resort for
// errors outside the router tree.

import { Link, isRouteErrorResponse, useRouteError, type RouteObject } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/atoms";
import { captureException } from "@/lib/integrations/sentry";

/** Chunk-load failures happen when a deploy swaps hashes under an open tab. */
export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|error loading dynamically imported/i.test(msg);
}

export function RouteErrorBoundary(): JSX.Element {
  const error = useRouteError();

  useEffect(() => {
    if (isRouteErrorResponse(error)) return;
    captureException(error, { extra: { source: "route-error-boundary" } });
  }, [error]);

  const staleChunk = isStaleChunkError(error);
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error ?? "Unknown error");

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-card rounded-2xl border border-default shadow-editorial p-6 md:p-8" role="alert">
        <div className="text-[11px] font-bold tracking-[0.28em] uppercase text-accent mb-3">
          {staleChunk ? "Update ready" : "This screen hit an error"}
        </div>

        <h1 className="font-display text-2xl font-light tracking-editorial text-fg-primary leading-tight mb-3">
          {staleChunk
            ? "A new version of SiteTrack was deployed."
            : "Something went wrong here — the rest of the app is fine."}
        </h1>

        <p className="text-sm text-fg-secondary mb-5 leading-relaxed">
          {staleChunk
            ? "Reload to pick up the latest version. Your work is saved on the server."
            : "You can go back to your dashboard, retry from the dashboard, or reload the page."}
        </p>

        {!staleChunk && (
          <pre className="bg-bg-secondary p-3 rounded-xl text-xs text-fg-tertiary overflow-x-auto mb-5 border border-default font-mono break-all whitespace-pre-wrap">
            {detail.slice(0, 240)}
          </pre>
        )}

        <div className="flex gap-2.5 flex-wrap">
          <Button onClick={() => window.location.reload()}>
            {staleChunk ? "Reload to update" : "Reload"}
          </Button>
          <Link to="/dashboard" className="inline-flex">
            <Button variant="secondary">Go to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Recursively attach the default `errorElement` to every route so ANY crashed
 * view degrades to the in-place error card. Leaf routes keep the surrounding
 * layout (shell stays alive); the layout route itself falls back to the same
 * card full-page.
 */
export function guardRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.map(route => {
    const next: RouteObject = { ...route };
    if (next.children) next.children = guardRoutes(next.children);
    if (!next.errorElement) next.errorElement = <RouteErrorBoundary />;
    return next;
  });
}
