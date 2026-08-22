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
import { composeV2Caps, decideV2 } from "./rbac2/resolver";

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

  // RBAC V2 layer: only applied when the session carries V2 context and the
  // org mode is 'enforce'. In 'shadow' mode V2 is computed but the matrix
  // still decides (audit-driven cutover); caller logs via writeAuditEvent().
  const rbac2 = session.rbac2;
  let v2Applied = false;
  let capabilities = all;
  let v2Trace: { mode: string; denies: Capability[]; grants: Capability[] } | undefined;
  if (rbac2 && rbac2.mode === "enforce") {
    // SEC-05 fail-closed: an enforce-mode context whose fetch failed mid-way
    // (fetchError) denies EVERYTHING — never silently downgrade to the broader
    // matrix. Server-side RLS (v2_policy_check in enforce) agrees: it has no
    // data either, so it denies too.
    const composed = rbac2.fetchError
      ? new Set<Capability>()
      : composeV2Caps({
          matrix: all,
          ctx: rbac2,
          userId: user.id,
          identityRole: user.identityRole,
          orgTier: orgTierForContext(session, context),
          resource: context.resource,
          clientEmail: context.clientEmail ?? (user.identityRole === "client" ? user.email : undefined),
        });
    capabilities = composed;
    v2Applied = true;
    const removed = new Set<Capability>(all);
    for (const c of composed) removed.delete(c);
    const added = new Set<Capability>(composed);
    for (const c of all) added.delete(c);
    v2Trace = {
      mode: "enforce",
      denies: Array.from(removed),
      grants: Array.from(added),
    };
  }

  const applied = overrides.filter(o => o.role === user.identityRole);
  return {
    capabilities,
    trace: {
      fromIdentity,
      ...(fromOrgAdmin !== undefined ? { fromOrgAdmin } : {}),
      ...(fromProjectTier !== undefined ? { fromProjectTier } : {}),
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
  // V2 shadow/enforce decision (ACL + bindings layered) when context present.
  const rbac2 = session.rbac2;
  if (rbac2 && (rbac2.mode === "shadow" || rbac2.mode === "enforce")) {
    const matrix = resolveCapabilities(session, context).capabilities;
    // shadow = matrix decides (V2 computed but never gates).
    if (rbac2.mode === "shadow") return matrix.has(capability);
    // SEC-05 fail-closed: enforce context fetch failure → deny (not matrix).
    if (rbac2.fetchError) return false;
    const d = decideV2({
      capability,
      matrixAllowed: matrix.has(capability),
      isSuperadmin: session.user.identityRole === "superadmin",
      ctx: rbac2,
      userId: session.user.id,
      identityRole: session.user.identityRole,
      orgTier: orgTierForContext(session, context),
      resource: context.resource,
      clientEmail: context.clientEmail ?? (session.user.identityRole === "client" ? session.user.email : undefined),
    });
    // enforce = V2 decides.
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
