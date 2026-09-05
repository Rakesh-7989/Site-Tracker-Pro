import type { AuthSession, CapabilityOverride, ResolveContext, ResolvedCapabilities } from "./types";
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
import { composeV2Caps, decideV2 } from "./rbacLayers";

const ADMIN_EXTRA_CAPS: Capability[] = [
  "org:members:manage", "org:billing:manage", "org:integrations:manage",
  "org:templates:manage", "org:approvals:manage", "org:notifications:manage",
  "org:branding:manage", "org:features:configure", "notification:configure",
  "vendor:manage", "vendor:select",
  "chat:manage",
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

/** Org-tier for the V2 resolver: 'admin' when the user is an admin of ctx.orgId. */
function orgTierForContext(session: AuthSession, context: ResolveContext): "admin" | "pm" | null {
  if (!context.orgId) return null;
  const m = session.orgs.find(o => o.orgId === context.orgId);
  if (m?.isAdmin || session.user.identityRole === "orgadmin") return "admin";
  return null;
}

/**
 * Matrix-only capability base: identity + org-admin + project-tier, with
 * superadmin overrides applied. The layered V2 resolver composes on top of
 * this RAW matrix (never the already-composed set) so a single pass drives
 * both resolveCapabilities() and can().
 */
function baseCapabilities(
  session: AuthSession,
  context: ResolveContext,
): {
  capabilities: Set<Capability>;
  fromIdentity: Capability[];
  fromOrgAdmin?: Capability[];
  fromProjectTier?: Capability[];
  applied: CapabilityOverride[];
} {
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

  const applied = (session.capabilityOverrides ?? []).filter(o => o.role === user.identityRole);

  return {
    capabilities: applyOverrides(union, session.capabilityOverrides ?? [], user.identityRole),
    fromIdentity,
    ...(fromOrgAdmin !== undefined ? { fromOrgAdmin } : {}),
    ...(fromProjectTier !== undefined ? { fromProjectTier } : {}),
    applied,
  };
}

export function resolveCapabilities(
  session: AuthSession,
  context: ResolveContext = {},
): ResolvedCapabilities {
  const base = baseCapabilities(session, context);

  // Layered V2 (RBAC V2 merged — always-on, no modes): when the session
  // carries layer context, compose V2 over the RAW matrix. SEC-05 fail-closed:
  // an enforce-context whose fetch failed mid-way (fetchError) denies
  // EVERYTHING — never silently downgrade to the broader matrix. Server-side
  // RLS (v2_policy_check) agrees: it has no data either, so it denies too.
  const layers = session.rbacLayers;
  let v2Applied = false;
  let capabilities = base.capabilities;
  let v2Trace: { mode: string; denies: Capability[]; grants: Capability[] } | undefined;
  if (layers) {
    v2Applied = true;
    const composed = layers.fetchError
      ? new Set<Capability>()
      : composeV2Caps({
          matrix: base.capabilities,
          ctx: layers,
          userId: session.user.id,
          identityRole: session.user.identityRole,
          orgTier: orgTierForContext(session, context),
          resource: context.resource,
          clientEmail: context.clientEmail ?? (session.user.identityRole === "client" ? session.user.email : undefined),
        });
    capabilities = composed;
    const removed = new Set<Capability>(base.capabilities);
    for (const c of composed) removed.delete(c);
    const added = new Set<Capability>(composed);
    for (const c of base.capabilities) added.delete(c);
    v2Trace = {
      mode: "enforce",
      denies: Array.from(removed),
      grants: Array.from(added),
    };
  }

  const applied = base.applied;
  return {
    capabilities,
    trace: {
      fromIdentity: base.fromIdentity,
      ...(base.fromOrgAdmin !== undefined ? { fromOrgAdmin: base.fromOrgAdmin } : {}),
      ...(base.fromProjectTier !== undefined ? { fromProjectTier: base.fromProjectTier } : {}),
      ...(applied.length ? {
        overrideGrants: applied.filter(o => o.mode === "grant").map(o => o.capability),
        overrideRevokes: applied.filter(o => o.mode === "revoke").map(o => o.capability),
      } : {}),
      ...(v2Trace && v2Applied ? {
        v2: v2Trace,
      } : {}),
    },
  };
}

export function can(
  session: AuthSession,
  capability: Capability,
  context: ResolveContext = {},
): boolean {
  // Layered V2 (merged — always-on when the session carries layer context):
  // decideV2 gates on the RAW matrix once (no double-pass). SEC-05 fail-closed:
  // a fetchError layer context denies — not the matrix. Without layer context
  // the matrix decides exactly as before.
  const layers = session.rbacLayers;
  if (layers) {
    if (layers.fetchError) return false;
    const matrix = baseCapabilities(session, context).capabilities;
    const d = decideV2({
      capability,
      matrixAllowed: matrix.has(capability),
      isSuperadmin: session.user.identityRole === "superadmin",
      ctx: layers,
      userId: session.user.id,
      identityRole: session.user.identityRole,
      orgTier: orgTierForContext(session, context),
      resource: context.resource,
      clientEmail: context.clientEmail ?? (session.user.identityRole === "client" ? session.user.email : undefined),
    });
    return d.allowed;
  }
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
