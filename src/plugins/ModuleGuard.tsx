// SiteTrack Pro — <ModuleGuard>: route-level module enforcement (v4 Phase 2).
//
// Wraps a route element for a route owned by a product module. When the active
// org hasn't enabled ANY of the required modules (ANY-of), renders an
// AccessDenied card instead of the view. This is defense-in-depth UNDER the
// nav gating from Phase 1 — direct URL access to a disabled module still gets
// blocked. Null enabled_modules (legacy org) → always renders children.
//
// Usage in the plugin router (see router.ts):
//   <ModuleGuard modules={["site_ops"]}><DPRComposer /></ModuleGuard>

import { type ReactNode } from "react";
import { useModules } from "@/modules";
import type { ModuleId } from "@/modules";
import { AccessDenied } from "@/components/ui/atoms";

export interface ModuleGuardProps {
  /** Modules — ANY-of: at least one must be enabled for children to render. */
  modules: readonly ModuleId[];
  children: ReactNode;
  /** Fallback to render instead of AccessDenied. Default: AccessDenied card. */
  fallback?: ReactNode;
}

export function ModuleGuard({ modules, children, fallback }: ModuleGuardProps): JSX.Element {
  const { isEnabled } = useModules();

  const allowed = modules.length === 0 || modules.some(m => isEnabled(m));
  if (!allowed) {
    return <>{fallback ?? <AccessDenied message="This module is not enabled for your organization. Ask your admin to enable it." />}</>;
  }
  return <>{children}</>;
}
