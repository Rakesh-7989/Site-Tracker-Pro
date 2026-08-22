// SiteTrack Pro — module registry barrel (v4 Phase 1).

export {
  MODULES,
  MODULE_IDS,
  moduleById,
  isModuleId,
  normalizeModules,
  isModuleEnabled,
  CORE_MODULE,
  INDUSTRY_TEMPLATES,
  templateModules,
  templateModulesForSegments,
  isRecommendedForSegment,
  alwaysOnModules,
} from "./registry";
export type { ModuleDef, ModuleId, EnabledModules } from "./types";
export { useModules, type UseModulesReturn } from "./useModules";
export { ModuleGate } from "./ModuleGate";
