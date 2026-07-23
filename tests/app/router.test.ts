// SiteTrack Pro — v3 router structural tests.
//
// Import-parity test: each lazy() import path in router.tsx must point to
// an existing file.  The route tree must have the expected sections.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROUTER_PATH = join(process.cwd(), "src/app/router.tsx");
const SRC_DIR = join(process.cwd(), "src");

const routerSrc = readFileSync(ROUTER_PATH, "utf8");

// Extract all lazy() import paths: import("@/features/...")
const lazyImports: string[] = [];
for (const m of routerSrc.matchAll(/import\(["']([^"']+)["']\)/g)) {
  lazyImports.push(m[1]);
}

// Extract all eager import paths from the module-level imports
const eagerImports: string[] = [];
for (const m of routerSrc.matchAll(/^import\s.*\sfrom\s["']([^"']+)["']/gm)) {
  const p = m[1];
  if (p.startsWith("@/")) eagerImports.push(p);
}

function resolveAlias(path: string): string {
  const resolved = path.replace(/^@\//, SRC_DIR + "/");
  // Try .tsx, .ts, .jsx, .js
  for (const ext of ["", ".tsx", ".ts", ".jsx", "", "/index.tsx", "/index.ts", "/index.jsx", "/index"]) {
    const candidate = resolved + ext;
    if (existsSync(candidate)) return candidate;
  }
  return resolved;
}

describe("lazy imports", () => {
  it("every lazy() import path resolves to an existing file", () => {
    const missing = lazyImports
      .map(p => ({ path: p, resolved: resolveAlias(p) }))
      .filter(({ resolved }) => !existsSync(resolved));
    expect(missing).toEqual([]);
  });

  it("has at least 45 lazy imports", () => {
    expect(lazyImports.length).toBeGreaterThanOrEqual(45);
  });

  it("includes the batch 6 + prod-phase-1 views added in Phase 4", () => {
    const paths = lazyImports.join(" ");
    expect(paths).toContain("HierarchyView");
    expect(paths).toContain("MaterialPricesView");
    expect(paths).toContain("DelegationsView");
    expect(paths).toContain("ComplianceView");
    expect(paths).toContain("ForecastView");
    expect(paths).toContain("PlatformBrandingView");
    expect(paths).toContain("PlatformAuditLogV2View");
    expect(paths).toContain("LabourKioskView");
    expect(paths).toContain("SiteWallKioskView");
    expect(paths).toContain("DailySnapshotView");
  });
});

describe("eager imports", () => {
  it("resolve to existing files", () => {
    const missing = eagerImports
      .map(p => ({ path: p, resolved: resolveAlias(p) }))
      .filter(({ resolved }) => !existsSync(resolved));
    expect(missing).toEqual([]);
  });

  it("includes ShellLayout, LandingView, and PlaceholderView modules", () => {
    const src = eagerImports.join(" ");
    expect(src).toContain("ShellLayout");
    expect(src).toContain("LandingView");
    expect(src).toContain("PlaceholderView");
  });
});

describe("route tree structure", () => {
  it("has public routes + auth layout + 404 catch-all", () => {
    expect(routerSrc).toContain('path: "/"');
    expect(routerSrc).toContain('element: <ShellLayout />');
    expect(routerSrc).toContain('path: "*"');
  });

  it("defines path patterns for org, admin, kiosk, and settings", () => {
    expect(routerSrc).toContain('path: "hierarchy"');
    expect(routerSrc).toContain('path: "admin/branding"');
    expect(routerSrc).toContain('path: "kiosk/labour"');
    expect(routerSrc).toContain('path: "settings/security"');
  });
});
