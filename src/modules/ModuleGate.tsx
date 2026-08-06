// SiteTrack Pro — <ModuleGate>: render children only if the active org has
// the module enabled; otherwise render `fallback` (null by default).
//
//   <ModuleGate module="design"><DesignStudio /></ModuleGate>
//
// Orthogonal to PlanGate (plan feature) and RBAC (capability): module gating
// is about which INDUSTRY MODULES the company switched on. Null config
// (legacy org) → always render children.

import type { ReactNode } from "react";
import { useModules } from "./useModules";
import type { ModuleId } from "./types";

export function ModuleGate({ module, children, fallback = null }: {
  module: ModuleId;
  children: ReactNode;
  fallback?: ReactNode;
}): JSX.Element {
  const { isEnabled } = useModules();
  if (isEnabled(module)) return <>{children}</>;
  return <>{fallback}</>;
}
