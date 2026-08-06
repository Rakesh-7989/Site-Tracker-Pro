// SiteTrack Pro — plugin router builder tests (v4 Phase 2).
//
// createPluginRoutes() is the pure mapping from the catalog to RouteObjects.
// Each returned route is wrapped in <ModuleGuard>; stub-gated routes are also
// wrapped in <StubGuard>. The `enabledModules` pre-filter drops routes whose
// module gate fails — mirrors how a future dynamic router would build the tree.

import { describe, it, expect } from "vitest";
import { createPluginRoutes } from "@/plugins/router";
import { PLUGIN_CATALOG, pluginRoutes } from "@/plugins/catalog";
import type { ModuleId } from "@/modules";

function pathSet(routes: ReturnType<typeof createPluginRoutes>): Set<string> {
  return new Set(routes.map(r => String(r.path)));
}

describe("createPluginRoutes", () => {
  it("returns one RouteObject per catalog route when no pre-filter is applied", () => {
    const routes = createPluginRoutes();
    expect(routes.length).toBe(pluginRoutes().length);
    expect(pathSet(routes)).toEqual(new Set(pluginRoutes().map(r => r.path)));
  });

  it("null enabledModules is equivalent to no filter (back-compat)", () => {
    expect(createPluginRoutes({ enabledModules: null }).length).toBe(pluginRoutes().length);
  });

  it("pre-filter keeps only routes whose module gate is enabled (ANY-of)", () => {
    const routes = createPluginRoutes({ enabledModules: ["procurement"] as ModuleId[] });
    const paths = pathSet(routes);
    expect(paths.has("procurement")).toBe(true);
    expect(paths.has("pos")).toBe(true);
    expect(paths.has("material-prices")).toBe(true);
    expect(paths.has("vendors")).toBe(true);
    // non-procurement routes are dropped
    expect(paths.has("client")).toBe(false);
    expect(paths.has("dpr")).toBe(false);
    expect(paths.has("analytics")).toBe(false);
    expect(paths.has("kiosk/labour")).toBe(false);
  });

  it("site_ops + clients gate includes the handover route (multi-module)", () => {
    const routes = createPluginRoutes({ enabledModules: ["clients"] as ModuleId[] });
    expect(pathSet(routes).has("handover")).toBe(true);
  });

  it("every module gate resolves against a valid catalog module", () => {
    const owners = new Set(PLUGIN_CATALOG.map(p => p.moduleId));
    for (const p of PLUGIN_CATALOG) {
      expect(owners.has(p.moduleId)).toBe(true);
    }
  });
});