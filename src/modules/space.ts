// SiteTrack Pro — Module: space (spatial hierarchy).
// Module ID: 'space'
// Defines the spatial hierarchy (site/building/floor/zone/room) as an enabled module.
// Used by: DetailView tab gating, nav-config module gates, onboarding module toggles.
// Mirrors the pattern from src/modules/types.ts, registry.ts, and moduleConfig.ts.

import type { ModuleId, ModuleDef, EnabledModules } from './types';
import type { OrgMembership } from '@/auth/types';

// ── 1. Module ID ──────────────────────────────────────────────────────────
export const MOD_ID: ModuleId = 'space';

// ── 2. Module definition ──────────────────────────────────────────────────
export const MOD_DEF: ModuleDef = {
  id: MOD_ID,
  label: 'Spatial Hierarchy',
  description: 'Site/Building/Floor/Zone/Room hierarchy for field operations and industry domains',
  icon: 'layout', // existing icon in icons.tsx; renders as layout icon
  alwaysOn: false, // controlled via onboarding module toggle + enabled_modules CHECK
  // All 4 industry templates include 'space' (set in registry.ts INDUSTRY_TEMPLATES)
};

// ── 3. Module enabled check ───────────────────────────────────────────────
/**
 * Returns true if the space module is enabled for the given org membership.
 * Null/undefined enabled_modules => module is enabled for all (back-compat).
 */
export function isModuleEnabled(
  membership?: OrgMembership['enabledModules'],
  id: ModuleId = MOD_ID
): boolean {
  if (!membership) return true; // back-compat: no modules configured yet
  // membership is ModuleId[] | null; null case already handled above
  const list = membership as ModuleId[] | undefined;
  // Check if id is explicitly set to true (rare pattern from raw DB)
  if (list != null && list.length > 0 && list.includes(id)) return true;
  // If membership is null/empty, back-compat: every module is enabled
  return true;
}

// ── 4. Exports ────────────────────────────────────────────────────────────
export type { ModuleId, ModuleDef, EnabledModules };

// ── 5. Default (for moduleConfig.ts use) ──────────────────────────────────
/**
 * Used by useModules.ts orgId derivation.
 * The space module does not own a route prefix that needs orgId filtering
 * at the hook level — it is query-layer filtered via location_id.
 * Return null for now; back-compat will show it as enabled.
 */
export const orgIdFromModule = (): string | null => null;