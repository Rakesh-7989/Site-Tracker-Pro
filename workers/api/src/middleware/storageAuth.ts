/**
 * SiteTrack Pro — Tenant-Scoped R2 Storage Key & Access Guard
 *
 * Ensures every R2 object key is scoped under `orgs/<orgId>/...` and verifies
 * org/project ownership on read and delete so authenticated callers can never
 * read or delete another tenant's files.
 */

import { TenantSecurityError, type SecurityContext } from "./tenant";
import { assertProjectOwnerOrg, assertProjectReadable } from "../repositories/projectAccess";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export function sanitizeSegment(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
  return cleaned || fallback;
}

export function buildTenantStorageKey(opts: {
  orgId: string;
  projectId?: string | null;
  folder?: string | null;
  filename: string;
}): string {
  const safeOrg = sanitizeSegment(opts.orgId, "org");
  const safeFolder = sanitizeSegment(opts.folder || "uploads", "uploads");
  const safeFile = sanitizeSegment(opts.filename, `file_${crypto.randomUUID()}`);
  const scope = opts.projectId
    ? `projects/${sanitizeSegment(opts.projectId, "project")}`
    : "general";
  return `orgs/${safeOrg}/${scope}/${safeFolder}/${crypto.randomUUID()}_${safeFile}`;
}

export async function assertStorageReadAccess(
  db: D1Database,
  ctx: SecurityContext,
  key: string
): Promise<void> {
  if (!key || key.includes("..") || key.includes("\\")) {
    throw new TenantSecurityError("Forbidden: Invalid storage key.");
  }
  if (key.startsWith(`orgs/${ctx.orgId}/`)) {
    return;
  }
  const projectMatch = key.match(/^orgs\/[^/]+\/projects\/([^/]+)\//);
  if (projectMatch?.[1]) {
    await assertProjectReadable(db, ctx, projectMatch[1]);
    return;
  }
  throw new TenantSecurityError("Forbidden: Storage object is outside tenant scope.");
}

export async function assertStorageDeleteAccess(
  db: D1Database,
  ctx: SecurityContext,
  key: string
): Promise<void> {
  if (!key || key.includes("..") || key.includes("\\")) {
    throw new TenantSecurityError("Forbidden: Invalid storage key.");
  }
  if (!key.startsWith(`orgs/${ctx.orgId}/`)) {
    throw new TenantSecurityError("Forbidden: Cannot delete storage objects owned by another organization.");
  }
  const projectMatch = key.match(/^orgs\/[^/]+\/projects\/([^/]+)\//);
  if (projectMatch?.[1]) {
    await assertProjectOwnerOrg(db, ctx, projectMatch[1], "Forbidden: Only the owner organization can delete project files.");
  }
}
