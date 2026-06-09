// SiteTrack Pro — capability + role guards (React side).
//
// Drop these into any JSX:
//
//   <RequireCapability capability="dpr:submit" projectId={p.id}>
//     <SubmitButton />
//   </RequireCapability>
//
//   const can = useCan("project:create", { orgId: activeOrg?.orgId });
//   {can && <NewProjectButton />}
//
// All guards consume AuthContext, so they only work below <AuthProvider>.
// When the session is still loading, guards render the `fallback` (default:
// nothing) — the wrapping screen typically shows a global spinner.

import { type ReactNode } from "react";

import type { Capability } from "./capabilities";
import type { IdentityRole } from "./roles";
import { can as pureCan, decide as pureDecide } from "./RoleResolver";
import type { ResolveContext } from "./types";
import { useAuth } from "./OrganizationContext";

// ── Hooks ─────────────────────────────────────────────────────────────────

/**
 * Boolean predicate hook. Returns false when the session isn't ready.
 * Re-evaluates whenever the session, capability, or context changes.
 */
export function useCan(capability: Capability, context: ResolveContext = {}): boolean {
  const { session } = useAuth();
  if (!session) return false;
  return pureCan(session, capability, context);
}

/**
 * Structured form — returns { allowed, reason } so callers can surface
 * a tooltip explaining WHY a button is disabled.
 */
export function useDecide(capability: Capability, context: ResolveContext = {}): { allowed: boolean; reason: string } {
  const { session } = useAuth();
  if (!session) return { allowed: false, reason: "Loading…" };
  return pureDecide(session, capability, context);
}

/**
 * Boolean predicate for identity-role gating (rare — prefer capability
 * checks for behavior, role checks only for branding / labeling).
 */
export function useHasRole(roles: ReadonlyArray<IdentityRole>): boolean {
  const { session } = useAuth();
  if (!session) return false;
  return roles.includes(session.user.identityRole);
}

// ── Components ────────────────────────────────────────────────────────────

export interface RequireCapabilityProps {
  capability: Capability;
  /** Optional. If set, layers org-tier capabilities. */
  orgId?: string;
  /** Optional. If set, layers project-tier capabilities. */
  projectId?: string;
  children: ReactNode;
  /** Rendered when the user lacks the capability. Default: nothing. */
  fallback?: ReactNode;
}

export function RequireCapability({
  capability,
  orgId,
  projectId,
  children,
  fallback = null,
}: RequireCapabilityProps): JSX.Element {
  const allowed = useCan(capability, {
    ...(orgId ? { orgId } : {}),
    ...(projectId ? { projectId } : {}),
  });
  return <>{allowed ? children : fallback}</>;
}

export interface RequireRoleProps {
  roles: ReadonlyArray<IdentityRole>;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireRole({ roles, children, fallback = null }: RequireRoleProps): JSX.Element {
  const has = useHasRole(roles);
  return <>{has ? children : fallback}</>;
}

/**
 * Hook form of the staff-area check (migration 106). Returns true when the
 * current session may access the given admin area. Owner/head (and any
 * non-member, e.g. a superadmin without a member tier) see everything; a
 * staff MEMBER is scoped to its granted areas (empty grants → all).
 */
export function useHasStaffArea(area: string): boolean {
  const { session } = useAuth();
  if (!session) return false;
  if (session.user.staffTier !== "member") return true;
  const areas = session.user.staffAreas ?? [];
  return areas.length === 0 || areas.includes(area);
}

export interface RequireStaffAreaProps {
  area: string;
  children: ReactNode;
  /** Rendered when a member isn't granted this area. Default: nothing. */
  fallback?: ReactNode;
}

/**
 * Route/section guard for the platform admin areas (migration 106). Use to
 * bounce a staff member who manually navigates to an area they aren't granted.
 */
export function RequireStaffArea({ area, children, fallback = null }: RequireStaffAreaProps): JSX.Element {
  const allowed = useHasStaffArea(area);
  return <>{allowed ? children : fallback}</>;
}

/**
 * Render `children` only when the session is fully loaded + ready.
 * Render `loading` while we're still fetching. Render `signedOut` if
 * no auth user is present.
 */
export interface RequireSessionProps {
  children: ReactNode;
  loading?: ReactNode;
  signedOut?: ReactNode;
  errorView?: ReactNode;
}

export function RequireSession({
  children,
  loading = null,
  signedOut = null,
  errorView = null,
}: RequireSessionProps): JSX.Element {
  const { session, status } = useAuth();
  if (status === "loading" || status === "idle") return <>{loading}</>;
  if (status === "signed-out") return <>{signedOut}</>;
  if (status === "error" || !session) return <>{errorView}</>;
  return <>{children}</>;
}
