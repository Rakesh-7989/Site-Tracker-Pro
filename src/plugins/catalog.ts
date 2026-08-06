// SiteTrack Pro — plugin catalog (v4 Phase 2).
//
// The single source of truth for "which module owns which route". The static
// router (router.tsx) spreads `createPluginRoutes()` into the shell children;
// each returned RouteObject is wrapped in <ModuleGuard> so a route for a
// module the active org hasn't enabled renders AccessDenied (defense-in-depth
// under the nav gating already added in Phase 1).
//
// Semantics:
//   - `modules` on a route is ANY-of (matches NavItem.modules). Empty → the
//     owning plugin's moduleId is used.
//   - Lazy factories use the SAME dynamic import() as the previous hardcoded
//     router — module chunks stay out of the initial bundle. Avoid mixing a
//     static + dynamic import of the same view (INEFFECTIVE_DYNAMIC_IMPORT).

import type { ModuleId } from "@/modules";
import type { PluginDef, PluginRoute } from "./types";

export const PLUGIN_CATALOG: readonly PluginDef[] = [
  {
    moduleId: "clients",
    label: "Client Portal",
    routes: [
      { path: "client", lazy: () => import("@/features/org/ClientPortalView").then(m => ({ default: m.ClientPortalView })) },
    ],
  },
  {
    moduleId: "site_ops",
    label: "Site Operations",
    routes: [
      { path: "dpr", lazy: () => import("@/features/dpr/DPRComposer").then(m => ({ default: m.DPRComposer })) },
      { path: "dpr/history", lazy: () => import("@/features/dpr/DPRHistoryView").then(m => ({ default: m.DPRHistoryView })) },
      { path: "dpr/:id", lazy: () => import("@/features/dpr/DPRDetailView").then(m => ({ default: m.DPRDetailView })) },
      { path: "handover", modules: ["site_ops", "clients"], lazy: () => import("@/features/handover/HandoverPacketView").then(m => ({ default: m.HandoverPacketView })) },
      { path: "measurement-book", lazy: () => import("@/features/handover/MeasurementBookView").then(m => ({ default: m.MeasurementBookView })) },
    ],
  },
  {
    moduleId: "procurement",
    label: "Procurement",
    routes: [
      { path: "vendors", lazy: () => import("@/features/org/VendorsView").then(m => ({ default: m.VendorsView })) },
      { path: "procurement", lazy: () => import("@/features/org/ProcurementView").then(m => ({ default: m.ProcurementView })) },
      { path: "pos", lazy: () => import("@/features/org/CrossProjectPOsView").then(m => ({ default: m.CrossProjectPOsView })) },
      { path: "material-prices", lazy: () => import("@/features/org/MaterialPricesView").then(m => ({ default: m.MaterialPricesView })) },
      { path: "equipment", lazy: () => import("@/features/handover/EquipmentView").then(m => ({ default: m.EquipmentView })) },
      { path: "vendor", lazy: () => import("@/features/org/VendorPortalView").then(m => ({ default: m.VendorPortalView })) },
    ],
  },
  {
    moduleId: "finance",
    label: "Finance & Billing",
    routes: [
      { path: "revenue", lazy: () => import("@/features/org/RevenueView").then(m => ({ default: m.RevenueView })) },
    ],
  },
  {
    moduleId: "insights",
    label: "Analytics & Insights",
    routes: [
      { path: "analytics", lazy: () => import("@/features/org/AnalyticsView").then(m => ({ default: m.AnalyticsView })) },
      { path: "forecast", lazy: () => import("@/features/org/ForecastView").then(m => ({ default: m.ForecastView })) },
    ],
  },
  {
    moduleId: "consultancy",
    label: "Consultancy Engagements",
    routes: [
      { path: "utilization", lazy: () => import("@/features/org/UtilizationView").then(m => ({ default: m.UtilizationView })) },
    ],
  },
  {
    moduleId: "compliance",
    label: "Compliance & NOC",
    routes: [
      { path: "compliance", lazy: () => import("@/features/org/ComplianceView").then(m => ({ default: m.ComplianceView })) },
    ],
  },
  {
    moduleId: "people",
    label: "People & HR",
    routes: [
      { path: "worklogs", lazy: () => import("@/features/handover/WorklogsView").then(m => ({ default: m.WorklogsView })) },
      { path: "hierarchy", lazy: () => import("@/features/org/HierarchyView").then(m => ({ default: m.HierarchyView })) },
    ],
  },
  {
    moduleId: "kiosks",
    label: "Kiosks & AR",
    routes: [
      { path: "kiosk/labour", stubId: "kiosk-labour", lazy: () => import("@/features/kiosk/LabourKioskView").then(m => ({ default: m.LabourKioskView })) },
      { path: "kiosk/site", stubId: "kiosk-site", lazy: () => import("@/features/kiosk/SiteWallKioskView").then(m => ({ default: m.SiteWallKioskView })) },
      { path: "kiosk/ar", stubId: "ar-overlay", lazy: () => import("@/features/kiosk/ARDrawingOverlayView").then(m => ({ default: m.ARDrawingOverlayView })) },
      { path: "kiosk/snapshot", stubId: "snapshot", lazy: () => import("@/features/kiosk/DailySnapshotView").then(m => ({ default: m.DailySnapshotView })) },
    ],
  },
];

/** Flat list of every catalog route. */
export function pluginRoutes(): PluginRoute[] {
  return PLUGIN_CATALOG.flatMap(p => p.routes);
}

/** The effective module gate for a route (route.modules ?? owning plugin module). */
export function routeModules(plugin: PluginDef, route: PluginRoute): readonly ModuleId[] {
  return (route.modules && route.modules.length ? route.modules : [plugin.moduleId]) as readonly ModuleId[];
}
