// SiteTrack Pro — plugin router builder (v4 Phase 2).
//
// Converts the plugin catalog into React Router RouteObjects, each wrapped in
// <ModuleGuard> so module-disabled orgs get AccessDenied on direct URL access.
//
// In the current (Option A) integration, the app router stays static and
// spreads `createPluginRoutes()` into the shell children. No session is needed
// at build time — ModuleGuard reads the active org's enabled_modules at render
// time. The optional `enabledModules` arg lets tests (and a future dynamic
// router) pre-filter without rendering.

import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

import { StubGuard } from "@/auth/StubGuard";
import type { EnabledModules } from "@/modules";
import { isModuleEnabled } from "@/modules";
import { PLUGIN_CATALOG, routeModules } from "./catalog";
import { ModuleGuard } from "./ModuleGuard";

export interface CreatePluginRoutesOptions {
  /** Pre-filter which modules are enabled (ANY-of per route). null = no filter. */
  enabledModules?: EnabledModules;
}

/**
 * Build plugin RouteObjects from the catalog. Each element is wrapped in
 * <ModuleGuard>; stub-gated routes (e.g. kiosks) are additionally wrapped in
 * <StubGuard>. When `enabledModules` is provided, routes whose module gate
 * fails are omitted entirely (useful for tests / dynamic routing).
 */
export function createPluginRoutes(options: CreatePluginRoutesOptions = {}): RouteObject[] {
  const { enabledModules = null } = options;

  const out: RouteObject[] = [];
  for (const plugin of PLUGIN_CATALOG) {
    for (const route of plugin.routes) {
      const modules = routeModules(plugin, route);

      // Optional eager filter — skip when pre-filtering is enabled and no
      // gate module is enabled.
      if (enabledModules !== null && !modules.some(m => isModuleEnabled(enabledModules, m))) {
        continue;
      }

      const View = lazy(route.lazy);
      const view = <View />;
      const guarded = route.stubId ? <StubGuard stubId={route.stubId}>{view}</StubGuard> : view;

      out.push({
        path: route.path,
        element: <ModuleGuard modules={modules}>{guarded}</ModuleGuard>,
      });
    }
  }
  return out;
}