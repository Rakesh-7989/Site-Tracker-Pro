// SiteTrack Pro — 3-axis capability resolver.
//
// Given a user + optional (orgId, projectId) context, returns the UNION
// of capabilities they hold from:
//   1. Their identity role (profiles.role)
//   2. Their org-tier role for that org (org_members.role)
//   3. Their project-tier role for that project (project_members.role)
//
// All three layers are read from the AuthSession the caller passes in.
// The resolver does NO async work + NO Supabase calls — it's a pure
// function over the auth state. The hook (useAuthUser) loads the state;
// the resolver reads it.
//
// Returning a `trace` of which tier granted what makes UX debugging
// straightforward — when the founder asks "why can the architect not
// create projects on this project but can on that one?", trace tells you
// whether they're missing the project_members.role.architect entry.

import type { AuthSession, ResolveContext, ResolvedCapabilities } from "./types";
import type { Capability } from "./capabilities";
import {
  identityCapabilities,
  orgTierCapabilities,
  projectTierCapabilities,
} from "./permissions-matrix";
import {
  isIdentityRole,
  isOrgTierRole,
  isProjectTierRole,
} from "./roles";

/**
 * Compute the capability set for a user in the given context.
 * Returns both the union Set + a per-tier trace.
 */
export function resolveCapabilities(
  session: AuthSession,
  context: ResolveContext = {},
): ResolvedCapabilities {
  const { user, orgs, projectMemberships } = session;

  // ── Tier 1: identity role ──
  const fromIdentity: Capability[] = isIdentityRole(user.identityRole)
    ? identityCapabilities(user.identityRole)
    : [];

  // ── Tier 2: org tier (only when orgId is in context) ──
  let fromOrgTier: Capability[] | undefined;
  if (context.orgId) {
    const membership = orgs.find(m => m.orgId === context.orgId);
    if (membership && isOrgTierRole(membership.role)) {
      fromOrgTier = orgTierCapabilities(membership.role);
    }
  }

  // ── Tier 3: project tier (only when projectId is in context AND active) ──
  let fromProjectTier: Capability[] | undefined;
  if (context.projectId) {
    const pm = projectMemberships.find(
      p => p.projectId === context.projectId && p.removedAt === null,
    );
    if (pm && isProjectTierRole(pm.role)) {
      fromProjectTier = projectTierCapabilities(pm.role);
    }
  }

  // ── Union ──
  const all = new Set<Capability>();
  for (const c of fromIdentity) all.add(c);
  if (fromOrgTier) for (const c of fromOrgTier) all.add(c);
  if (fromProjectTier) for (const c of fromProjectTier) all.add(c);

  return {
    capabilities: all,
    trace: {
      fromIdentity,
      ...(fromOrgTier !== undefined ? { fromOrgTier } : {}),
      ...(fromProjectTier !== undefined ? { fromProjectTier } : {}),
    },
  };
}

/**
 * Convenience predicate. Returns true if the user has the capability
 * in the given context.
 */
export function can(
  session: AuthSession,
  capability: Capability,
  context: ResolveContext = {},
): boolean {
  return resolveCapabilities(session, context).capabilities.has(capability);
}

/**
 * Structured form of can() with a human-readable reason. Useful for UX
 * error messages ("you need to be assigned as architect on this project").
 */
export function decide(
  session: AuthSession,
  capability: Capability,
  context: ResolveContext = {},
): { allowed: boolean; reason: string } {
  const resolved = resolveCapabilities(session, context);
  if (resolved.capabilities.has(capability)) {
    return { allowed: true, reason: "" };
  }
  // Try to be specific about WHY.
  if (context.projectId && !session.projectMemberships.some(p => p.projectId === context.projectId && p.removedAt === null)) {
    return {
      allowed: false,
      reason: `Not assigned as a project member on this project.`,
    };
  }
  if (context.orgId && !session.orgs.some(o => o.orgId === context.orgId)) {
    return {
      allowed: false,
      reason: `Not a member of this organization.`,
    };
  }
  return {
    allowed: false,
    reason: `Your role (${session.user.identityRole}) does not include the capability "${capability}".`,
  };
}

/**
 * Returns ALL capabilities the user has across ANY context they could
 * operate in. Useful for nav rendering (show every menu they MIGHT
 * be able to reach somewhere). NOT a security boundary — UI gates
 * still re-check with the right context.
 */
export function capabilitiesAnywhere(session: AuthSession): Set<Capability> {
  const out = new Set<Capability>();
  // Identity-tier
  for (const c of identityCapabilities(session.user.identityRole)) out.add(c);
  // Every org-tier
  for (const org of session.orgs) {
    if (isOrgTierRole(org.role)) {
      for (const c of orgTierCapabilities(org.role)) out.add(c);
    }
  }
  // Every project-tier (active rows only)
  for (const pm of session.projectMemberships) {
    if (pm.removedAt === null && isProjectTierRole(pm.role)) {
      for (const c of projectTierCapabilities(pm.role)) out.add(c);
    }
  }
  return out;
}
