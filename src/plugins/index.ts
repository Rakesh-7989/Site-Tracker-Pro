// SiteTrack Pro — plugin registry barrel (v4 Phase 2).

export { PLUGIN_CATALOG, pluginRoutes, routeModules } from "./catalog";
export { ModuleGuard } from "./ModuleGuard";
export { createPluginRoutes, type CreatePluginRoutesOptions } from "./router";
export type { PluginDef, PluginRoute, PluginLazy } from "./types";
