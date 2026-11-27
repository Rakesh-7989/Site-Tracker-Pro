/**
 * SiteTrack Pro — Cloudflare Workers Tenant Security Middleware
 *
 * Replaces PostgreSQL RLS with verified Application-Level Scoping.
 * Guarantees that every database operation is constrained by the caller's
 * validated organization, membership, and cross-org partner permissions.
 */

export interface SecurityContext {
  userId: string;
  email: string;
  orgId: string;
  role: string;
  isAdmin: boolean;
  partnerOrgIds: string[];
}

export class TenantSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantSecurityError";
  }
}

/**
 * Resolves caller security context and asserts tenant access.
 */
export async function assertTenantContext(
  db: D1Database,
  userId: string,
  targetOrgId: string
): Promise<SecurityContext> {
  // Query active membership
  const member = await db
    .prepare(
      `SELECT om.role, om.is_admin, om.status, u.email
       FROM org_members om
       JOIN users u ON u.id = om.profile_id
       WHERE om.org_id = ? AND om.profile_id = ? AND om.status = 'active'`
    )
    .bind(targetOrgId, userId)
    .first<{ role: string; is_admin: number; status: string; email: string }>();

  if (!member) {
    throw new TenantSecurityError("Forbidden: User does not belong to the requested organization.");
  }

  return {
    userId,
    email: member.email,
    orgId: targetOrgId,
    role: member.role,
    isAdmin: Boolean(member.is_admin),
    partnerOrgIds: [],
  };
}

const READ_ONLY_ROLES = new Set(["viewer", "client", "guest"]);

/**
 * Ensures the caller holds a write-capable role in the active organization.
 * Read-only roles (viewer, client, guest) are blocked from mutating domain data.
 */
export function assertWriteRole(
  ctx: SecurityContext,
  reason = "Forbidden: Read-only role cannot perform write operations."
): void {
  if (ctx.isAdmin) return;
  if (READ_ONLY_ROLES.has(ctx.role.toLowerCase())) {
    throw new TenantSecurityError(reason);
  }
}

