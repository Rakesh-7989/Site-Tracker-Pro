import type { AuthSession, ResolveContext, ResolvedCapabilities } from "./types";
import type { Capability } from "./capabilities";
import {
  identityCapabilities,
  projectTierCapabilities,
} from "./permissions-matrix";
import {
  isIdentityRole,
  isProjectTierRole,
} from "./roles";
import { applyOverrides } from "./capabilityOverrides";

const ADMIN_EXTRA_CAPS: Capability[] = [
  "org:members:manage", "org:billing:manage", "org:integrations:manage",
  "org:templates:manage", "org:approvals:manage", "org:notifications:manage",
  "org:branding:manage", "org:features:configure", "notification:configure",
  "vendor:manage", "vendor:select",
  "project:create", "project:archive", "project:restore", "project:settings:edit",
  "team:manage",
  "compliance:view",
  "budget:view", "budget:edit", "ledger:view",
  "changeorder:approve", "po:approve", "invoice:approve", "rabill:approve", "expense:approve",
  "audit:read",
  "export:pdf", "export:csv",
  "share:project:public",
  "handover:generate",
  "time:log", "time:manage", "phase:manage",
  "deliverable:manage", "deliverable:approve",
  "review:comment", "review:manage",
  "utilization:view",
  "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
  "ffe:manage", "statutory:manage", "procurement:view",
  "audit:manage",
];

export function resolveCapabilities(
  session: AuthSession,
  context: ResolveContext = {},
): ResolvedCapabilities {
  const { user, orgs, projectMemberships } = session;

  const fromIdentity: Capability[] = isIdentityRole(user.identityRole)
    ? identityCapabilities(user.identityRole)
    : [];

  let fromOrgAdmin: Capability[] | undefined;
  if (context.orgId) {
    const membership = orgs.find(m => m.orgId === context.orgId);
    if (membership && (membership.isAdmin || user.identityRole === "orgadmin")) {
      fromOrgAdmin = ADMIN_EXTRA_CAPS;
    }
  }

  let fromProjectTier: Capability[] | undefined;
  if (context.projectId) {
    const pm = projectMemberships.find(
      p => p.projectId === context.projectId && p.removedAt === null,
    );
    if (pm && isProjectTierRole(pm.role)) {
      fromProjectTier = projectTierCapabilities(pm.role);
    }
  }

  const union = new Set<Capability>();
  for (const c of fromIdentity) union.add(c);
  if (fromOrgAdmin) for (const c of fromOrgAdmin) union.add(c);
  if (fromProjectTier) for (const c of fromProjectTier) union.add(c);

  const overrides = session.capabilityOverrides ?? [];
  const all = applyOverrides(union, overrides, user.identityRole);

  const applied = overrides.filter(o => o.role === user.identityRole);
  return {
    capabilities: all,
    trace: {
      fromIdentity,
      ...(fromOrgAdmin !== undefined ? { fromOrgAdmin } : {}),
      ...(fromProjectTier !== undefined ? { fromProjectTier } : {}),
      ...(applied.length ? {
        overrideGrants: applied.filter(o => o.mode === "grant").map(o => o.capability),
        overrideRevokes: applied.filter(o => o.mode === "revoke").map(o => o.capability),
      } : {}),
    },
  };
}

export function can(
  session: AuthSession,
  capability: Capability,
  context: ResolveContext = {},
): boolean {
  return resolveCapabilities(session, context).capabilities.has(capability);
}

export function decide(
  session: AuthSession,
  capability: Capability,
  context: ResolveContext = {},
): { allowed: boolean; reason: string } {
  const resolved = resolveCapabilities(session, context);
  if (resolved.capabilities.has(capability)) {
    return { allowed: true, reason: "" };
  }
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

export function capabilitiesAnywhere(session: AuthSession): Set<Capability> {
  const out = new Set<Capability>();
  for (const c of identityCapabilities(session.user.identityRole)) out.add(c);
  for (const org of session.orgs) {
    if (org.isAdmin || session.user.identityRole === "orgadmin") {
      for (const c of ADMIN_EXTRA_CAPS) out.add(c);
      break;
    }
  }
  for (const pm of session.projectMemberships) {
    if (pm.removedAt === null && isProjectTierRole(pm.role)) {
      for (const c of projectTierCapabilities(pm.role)) out.add(c);
    }
  }
  return applyOverrides(out, session.capabilityOverrides ?? [], session.user.identityRole);
}
