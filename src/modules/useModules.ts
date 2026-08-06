// SiteTrack Pro — useModules() hook (v4 Phase 1).
//
// Reads the ACTIVE org's enabled_modules from the auth session and exposes a
// reactive `isEnabled(id)` predicate. A null configuration (legacy org that
// hasn't picked modules yet) treats every module as enabled.

import { useCallback, useMemo } from "react";
import { useOrgSwitcher } from "@/auth";
import { isModuleEnabled, type EnabledModules } from "./registry";
import type { ModuleId } from "./types";

export interface UseModulesReturn {
  /** Active org's enabled_modules (null = not configured = all enabled). */
  enabledModules: EnabledModules;
  /** Whether a module is enabled for the active org. */
  isEnabled: (id: ModuleId) => boolean;
  /** Active org id (null when the user has no org). */
  orgId: string | null;
}

export function useModules(): UseModulesReturn {
  const { activeOrg } = useOrgSwitcher();
  const enabledModules = (activeOrg?.enabledModules ?? null) as EnabledModules;
  const isEnabled = useCallback((id: ModuleId) => isModuleEnabled(enabledModules, id), [enabledModules]);
  return useMemo(
    () => ({ enabledModules, isEnabled, orgId: activeOrg?.orgId ?? null }),
    [enabledModules, isEnabled, activeOrg?.orgId],
  );
}
