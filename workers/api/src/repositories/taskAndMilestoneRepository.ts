/**
 * SiteTrack Pro — Cloudflare Workers Task, Milestone & Risk Signals Repository
 *
 * Tenant-scoped D1 queries for tasks, milestones, and project_risk_signals.
 * Every query verifies project ownership or active cross-org partner membership
 * via assertProjectReadable; writes are restricted to the owner organization.
 */

import { TenantSecurityError, type SecurityContext } from "../middleware/tenant";
import { assertProjectReadable } from "./projectAccess";

export type D1TaskStatus = "todo" | "in_progress" | "review" | "done";
export type D1MilestoneStatus = "pending" | "in_progress" | "completed" | "blocked";

export class TaskAndMilestoneRepository {
  constructor(private db: D1Database) {}

  async listTasks(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createTask(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      title: string;
      description?: string;
      milestoneId?: string;
      assigneeId?: string;
      priority?: "low" | "medium" | "high" | "critical";
      dueDate?: string;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can create tasks.");
    }
    await this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, milestone_id, title, description, assignee_id, priority, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.milestoneId || null,
        input.title,
        input.description || null,
        input.assigneeId ?? ctx.userId,
        input.priority || "medium",
        input.dueDate || null
      )
      .run();
  }

  async updateTaskStatus(
    ctx: SecurityContext,
    projectId: string,
    taskId: string,
    status: D1TaskStatus
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can update tasks.");
    }
    const res = await this.db
      .prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`)
      .bind(status, taskId, projectId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async listMilestones(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM milestones WHERE project_id = ? ORDER BY order_index ASC, created_at ASC`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createMilestone(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      title: string;
      description?: string;
      dueDate?: string;
      weight?: number;
      orderIndex?: number;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can create milestones.");
    }
    await this.db
      .prepare(
        `INSERT INTO milestones (id, project_id, title, description, due_date, weight, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.title,
        input.description || null,
        input.dueDate || null,
        input.weight ?? 1.0,
        input.orderIndex ?? 0
      )
      .run();
  }

  async updateMilestoneStatus(
    ctx: SecurityContext,
    projectId: string,
    milestoneId: string,
    status: D1MilestoneStatus
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can update milestones.");
    }
    const res = await this.db
      .prepare(`UPDATE milestones SET status = ? WHERE id = ? AND project_id = ?`)
      .bind(status, milestoneId, projectId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async listRiskSignals(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM project_risk_signals WHERE project_id = ?`)
      .bind(projectId)
      .all();
    return results || [];
  }
}
