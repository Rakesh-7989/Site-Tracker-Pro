/**
 * SiteTrack Pro — Phase 8 Site Controls Repository (RFI, Change Orders, RA Bills)
 *
 * Implements D1-backed CRUD with tenant + write-role enforcement for:
 *   - rfi
 *   - change_orders
 *   - ra_bills
 */

import { assertWriteRole, type SecurityContext } from "../middleware/tenant";
import { assertProjectOwnerOrg, assertProjectReadable } from "./projectAccess";

export type RfiStatus = "open" | "answered" | "closed" | "overdue";
export type ChangeOrderStatus = "submitted" | "approved" | "rejected" | "cancelled";
export type RaBillStatus = "submitted" | "approved" | "paid" | "rejected";

export class Phase8SiteControlsRepository {
  constructor(private db: D1Database) {}

  // ── RFI ─────────────────────────────────────────────────────────────────────

  async listRfis(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, no, subject, question, category, asked_by, asked_at, due_date, status, response, responded_by, responded_at, created_at
         FROM rfi
         WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createRfi(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; no: string; subject: string; question: string; category?: string; dueDate?: string }
  ) {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can create RFIs.");
    await this.db
      .prepare(
        `INSERT INTO rfi (id, project_id, no, subject, question, category, asked_by, asked_at, due_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'open')`
      )
      .bind(
        input.id,
        projectId,
        input.no.trim(),
        input.subject.trim(),
        input.question.trim(),
        input.category || null,
        ctx.userId,
        input.dueDate || null
      )
      .run();
    return { id: input.id };
  }

  async updateRfi(
    ctx: SecurityContext,
    projectId: string,
    rfiId: string,
    input: { status?: RfiStatus; response?: string }
  ): Promise<boolean> {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can update RFIs.");
    const nextStatus = input.status || (input.response ? "answered" : "open");
    const res = await this.db
      .prepare(
        `UPDATE rfi
         SET status = ?,
             response = COALESCE(?, response),
             responded_by = CASE WHEN ? IS NOT NULL THEN ? ELSE responded_by END,
             responded_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE responded_at END
         WHERE id = ? AND project_id = ?`
      )
      .bind(
        nextStatus,
        input.response ?? null,
        input.response ?? null,
        ctx.userId,
        input.response ?? null,
        rfiId,
        projectId
      )
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ── CHANGE ORDERS ───────────────────────────────────────────────────────────

  async listChangeOrders(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, no, description, scope_change, cost_impact, schedule_impact, reason, raised_by, raised_at, status, approved_by, approved_at, created_at
         FROM change_orders
         WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createChangeOrder(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      no: string;
      description: string;
      scopeChange?: string;
      costImpact?: number;
      scheduleImpact?: number;
      reason?: string;
    }
  ) {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can create change orders.");
    await this.db
      .prepare(
        `INSERT INTO change_orders (id, project_id, no, description, scope_change, cost_impact, schedule_impact, reason, raised_by, raised_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'submitted')`
      )
      .bind(
        input.id,
        projectId,
        input.no.trim(),
        input.description.trim(),
        input.scopeChange || null,
        input.costImpact ?? null,
        input.scheduleImpact ?? null,
        input.reason || null,
        ctx.userId
      )
      .run();
    return { id: input.id };
  }

  async updateChangeOrderStatus(
    ctx: SecurityContext,
    projectId: string,
    coId: string,
    status: ChangeOrderStatus
  ): Promise<boolean> {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can update change orders.");
    const res = await this.db
      .prepare(
        `UPDATE change_orders
         SET status = ?,
             approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
             approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END
         WHERE id = ? AND project_id = ?`
      )
      .bind(status, status, ctx.userId, status, coId, projectId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ── RA BILLS ────────────────────────────────────────────────────────────────

  async listRaBills(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, no, subcontractor, scope, bill_amount, cumulative, retention_pct, paid_amount, status, bill_date
         FROM ra_bills
         WHERE project_id = ?
         ORDER BY bill_date DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createRaBill(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      no: string;
      subcontractor?: string;
      scope?: string;
      billAmount: number;
      cumulative?: number;
      retentionPct?: number;
      billDate?: string;
    }
  ) {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can create RA bills.");
    await this.db
      .prepare(
        `INSERT INTO ra_bills (id, project_id, no, subcontractor, scope, bill_amount, cumulative, retention_pct, paid_amount, status, bill_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'submitted', COALESCE(?, date('now')))`
      )
      .bind(
        input.id,
        projectId,
        input.no.trim(),
        input.subcontractor || null,
        input.scope || null,
        Math.round(input.billAmount),
        input.cumulative ?? null,
        input.retentionPct ?? 5,
        input.billDate || null
      )
      .run();
    return { id: input.id };
  }

  async updateRaBillStatus(
    ctx: SecurityContext,
    projectId: string,
    billId: string,
    input: { status: RaBillStatus; paidAmount?: number }
  ): Promise<boolean> {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can update RA bills.");
    const res = await this.db
      .prepare(
        `UPDATE ra_bills
         SET status = ?,
             paid_amount = COALESCE(?, paid_amount)
         WHERE id = ? AND project_id = ?`
      )
      .bind(input.status, input.paidAmount ?? null, billId, projectId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }
}
