/**
 * SiteTrack Pro — Shared Project Access Helpers for Workers Repositories
 *
 * Centralizes tenant + cross-org partner read/write checks so repositories
 * never duplicate SQL scoping predicates.
 */

import { TenantSecurityError, type SecurityContext } from "../middleware/tenant";

export async function assertProjectReadable(
  db: D1Database,
  ctx: SecurityContext,
  projectId: string
): Promise<{ org_id: string; isOwnerOrg: boolean }> {
  const row = await db
    .prepare(
      `SELECT p.org_id,
              CASE WHEN p.org_id = ? THEN 1 ELSE 0 END AS is_owner
       FROM projects p
       WHERE p.id = ?
         AND (
           p.org_id = ?
           OR p.id IN (
             SELECT ppo.project_id
             FROM project_partner_orgs ppo
             WHERE ppo.org_id = ? AND ppo.status = 'active'
           )
         )`
    )
    .bind(ctx.orgId, projectId, ctx.orgId, ctx.orgId)
    .first<{ org_id: string; is_owner: number }>();

  if (!row) {
    throw new TenantSecurityError("Forbidden: Project not found or outside tenant scope.");
  }

  return { org_id: row.org_id, isOwnerOrg: Boolean(row.is_owner) };
}

export async function assertProjectOwnerOrg(
  db: D1Database,
  ctx: SecurityContext,
  projectId: string,
  reason = "Forbidden: Restricted to the owner organization."
): Promise<void> {
  const row = await db
    .prepare(`SELECT id FROM projects WHERE id = ? AND org_id = ?`)
    .bind(projectId, ctx.orgId)
    .first<{ id: string }>();

  if (!row) {
    throw new TenantSecurityError(reason);
  }
}
