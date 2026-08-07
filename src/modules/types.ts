// SiteTrack Pro — module registry types (v4 Phase 1).
//
// A MODULE is a cohesive product area a company can switch on/off, aligned
// to the "One Platform, Multiple Industry Modules" strategy. The org stores
// its selection in organizations.enabled_modules (migration 155); the JS
// registry (registry.ts) is the single source of truth for ids, labels,
// icons, and the per-industry templates.
//
// This file has ZERO runtime imports so it can be referenced from the auth
// layer without creating import cycles.

import type { IconName } from "@/components/ui/icons";

/** Valid module ids (must match migration 155 CHECK + MODULES registry). */
export type ModuleId =
  | "projects"
  | "clients"
  | "site_ops"
  | "design"
  | "consultancy"
  | "finance"
  | "procurement"
  | "compliance"
  | "people"
  | "insights"
  | "kiosks"
  | "crm";

/** Static metadata for a module. */
export interface ModuleDef {
  id: ModuleId;
  /** UI label (nav / onboarding toggles). */
  label: string;
  /** One-line description for the onboarding toggle. */
  description: string;
  /** Sidebar/onboarding icon. */
  icon: IconName;
  /** Whether the module is a core, always-enabled module. */
  alwaysOn?: boolean;
}

/**
 * The enabled_modules value as stored on an organization.
 * null = not configured yet → treat every module as enabled (back-compat).
 */
export type EnabledModules = ModuleId[] | null;
