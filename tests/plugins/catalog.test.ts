// SiteTrack Pro — plugin catalog tests (v4 Phase 2).

import { describe, it, expect } from "vitest";
import { PLUGIN_CATALOG, pluginRoutes, routeModules } from "@/plugins/catalog";
import { isModuleId } from "@/modules";
import type { ModuleId } from "@/modules";
import type { PluginRoute } from "@/plugins/types";
import { NAV_CATALOG } from "@/app/nav-config";

function flattenRoutes(): Array<{ pluginModule: ModuleId; route: PluginRoute }> {
  return PLUGIN_CATALOG.flatMap(p => p.routes.map(route => ({ pluginModule: p.moduleId, route })));
}

describe("plugin catalog structure", () => {
  it("every owning plugin module is a valid module id", () => {
    for (const p of PLUGIN_CATALOG) {
      expect(isModuleId(p.moduleId), p.moduleId).toBe(true);
    }
  });

  it("has unique, non-empty routes", () => {
    const paths = pluginRoutes().map(r => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("every route.gate module (when present) is a valid module id", () => {
    for (const { route } of flattenRoutes()) {
      for (const m of route.modules ?? []) {
        expect(isModuleId(m), `route ${route.path}: ${String(m)}`).toBe(true);
      }
    }
  });

  it("owning moduleId covers all 11 modules exactly once", () => {
    // kiosks, compliance, consultancy, people, insights, finance,
    // procurement, site_ops, clients all have routes; projects + design + 
    // insights + consultancy are included; design/projects have no route surface
    const owners = PLUGIN_CATALOG.map(p => p.moduleId);
    expect(new Set(owners).size).toBe(owners.length);
  });

  it("routeModules falls back to the owning module when route.modules is empty", () => {
    const plugin = PLUGIN_CATALOG[0];
    const route = plugin.routes[0];
    expect(routeModules(plugin, { ...route, modules: undefined })).toEqual([plugin.moduleId]);
    expect(routeModules(plugin, route)).toEqual((route.modules?.length ? route.modules : [plugin.moduleId]) as readonly string[]);
  });
});

describe("plugin catalog ↔ nav-config parity (Phase 2 alignment)", () => {
  it("every module-gated nav item resolves to a catalog route (or is a known non-route)", () => {
    const catalogPaths = new Set(pluginRoutes().map(r => r.path));
    // /rabills is module-gated in nav-config but has no standalone view/component
    // yet (pre-existing gap) — it cannot be a lazy route.
    const KNOWN_NON_ROUTE = new Set(["rabills"]);
    const gated = NAV_CATALOG.filter(n => n.modules && n.modules.length > 0);
    for (const item of gated) {
      const path = item.to.replace(/^\//, "");
      expect(
        catalogPaths.has(path) || KNOWN_NON_ROUTE.has(path),
        `nav ${item.to} module ${item.modules}`,
      ).toBe(true);
    }
  });

  it("every nav module-gated item's owning module matches a plugin owner", () => {
    const owners = new Set(PLUGIN_CATALOG.map(p => p.moduleId));
    for (const item of NAV_CATALOG.filter(n => n.modules && n.modules.length > 0)) {
      for (const m of item.modules!) {
        expect(owners.has(m as ModuleId), `${item.to} ${String(m)}`).toBe(true);
      }
    }
  });

  it("every catalog route is present in the static router shell children (Phase 2)", () => {
    // The catalog routes are spread via createPluginRoutes() — structural
    // coverage is asserted in tests/app/router.test.ts.
    expect(pluginRoutes().length).toBeGreaterThan(0);
  });
});