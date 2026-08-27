// SiteTrack Pro — StubGuard component for route-level stub view enforcement.
//
// Blocks non-staff users from accessing stub views (features gated behind
// STUB_VIEWS in featureFlags.ts). Staff users (is_staff flag, superadmin
// role, or VITE_STAFF_EMAILS allowlist) pass through to the child view.
//
// Usage in router:
//   { path: "forecast", element: <StubGuard stubId="forecast"><ForecastView /></StubGuard> }

import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./OrganizationContext";
import { STUB_VIEWS } from "@/lib/integrations/featureFlags";
import { AccessDenied } from "@/components/ui/atoms";

export interface StubGuardProps {
  stubId: string;
  children: ReactNode;
  fallbackPath?: string;
}

function isStaffUser(user: { isStaff?: boolean; identityRole?: string; email?: string }): boolean {
  if (user.isStaff === true) return true;
  if (user.identityRole === "superadmin") return true;
  try {
    const env = (typeof import.meta !== "undefined" ? import.meta.env : {}) as Record<string, unknown>;
    const allow = (env.VITE_STAFF_EMAILS as string) || "";
    if (!allow) return false;
    const list = allow.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    return list.includes((user.email ?? "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function isBlocked(user: { isStaff?: boolean; identityRole?: string; email?: string }, viewId: string): boolean {
  return STUB_VIEWS.has(viewId) && !isStaffUser(user);
}

export function StubGuard({ stubId, children, fallbackPath = "/dashboard" }: StubGuardProps): JSX.Element {
  const { session } = useAuth();

  if (session && isBlocked(session.user, stubId)) {
    return <AccessDenied message="This feature is restricted to platform staff. Contact your admin to request access." />;
  }

  if (!session) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}