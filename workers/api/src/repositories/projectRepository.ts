/**
 * SiteTrack Pro — Cloudflare Workers Project Repository
 *
 * Implements strict tenant-isolated queries with Cross-Org Partner (C1/C2)
 * read and contributor write support on top of Cloudflare D1.
 */

import type { SecurityContext } from "../middleware/tenant";

export interface ProjectRecord {
  id: string;
  org_id: string;
  name: string;
  type: string;
  status: string;
  progress: number;
  budget: number;
  created_at: string;
  updated_at: string;
}

export class ProjectRepository {
  constructor(private db: D1Database) {}

  /**
   * Lists all projects accessible to the user:
   * 1. Projects belonging to the user's active organization.
   * 2. Projects shared with the user's organization via active partner links (C1/C2).
   */
  async listProjects(ctx: SecurityContext): Promise<ProjectRecord[]> {
    const query = `
      SELECT p.*
      FROM projects p
      WHERE p.org_id = ?
         OR p.id IN (
            SELECT ppo.project_id 
            FROM project_partner_orgs ppo
            WHERE ppo.org_id = ? AND ppo.status = 'active'
         )
      ORDER BY p.updated_at DESC
    `;

    const { results } = await this.db.prepare(query).bind(ctx.orgId, ctx.orgId).all<ProjectRecord>();
    return results || [];
  }

  /**
   * Fetch a single project by ID with tenant verification.
   */
  async getProjectById(ctx: SecurityContext, projectId: string): Promise<ProjectRecord | null> {
    const query = `
      SELECT p.*
      FROM projects p
      WHERE p.id = ? 
        AND (
          p.org_id = ? 
          OR p.id IN (
            SELECT ppo.project_id 
            FROM project_partner_orgs ppo
            WHERE ppo.org_id = ? AND ppo.status = 'active'
          )
        )
    `;

    return await this.db.prepare(query).bind(projectId, ctx.orgId, ctx.orgId).first<ProjectRecord>();
  }

  /**
   * Creates a project under the tenant organization.
   */
  async createProject(
    ctx: SecurityContext,
    project: { id: string; name: string; type: string; budget?: number }
  ): Promise<void> {
    const query = `
      INSERT INTO projects (id, org_id, name, type, budget)
      VALUES (?, ?, ?, ?, ?)
    `;

    await this.db
      .prepare(query)
      .bind(project.id, ctx.orgId, project.name, project.type, project.budget ?? 0)
      .run();
  }
}

