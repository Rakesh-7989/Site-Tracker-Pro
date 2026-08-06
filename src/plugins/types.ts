// SiteTrack Pro — plugin registry types (v4 Phase 2).
//
// A PLUGIN is the route-surface of a product module (see @/modules). Each
// plugin owns the lazy route definitions for its views, gated by the module
// at the route level (ModuleGuard). The catalog (catalog.ts) is the single
// source of truth for "which routes belong to which module".
//
// This file is type-only (zero runtime imports) so the catalog stays pure
// and fully testable without importing React.

import type { ComponentType } from "react";
import type { ModuleId } from "@/modules";

/** Lazy import factory — resolves to the view component's default export. */
export type PluginLazy = () => Promise<{ default: ComponentType }>;

/** A single route owned by a plugin. */
export interface PluginRoute {
  /** Route path relative to the shell root (e.g. "client"). */
  path: string;
  /**
   * Modules that gate this route — ANY-of semantics (at least one must be
   * enabled), mirroring NavItem.modules. Empty → the owning plugin's
   * moduleId is used.
   */
  modules?: readonly ModuleId[];
  /** Lazy import factory (kept as a function so tests never trigger loads). */
  lazy: PluginLazy;
  /** Optional stub gate id (e.g. "kiosk-labour") — mirrors StubGuard. */
  stubId?: string;
}

/** A plugin = the route surface of one product module. */
export interface PluginDef {
  /** Owning module id — the default module gate for its routes. */
  moduleId: ModuleId;
  /** Display label (grouping / diagnostics). */
  label: string;
  /** Routes owned by this plugin. */
  routes: readonly PluginRoute[];
}
