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
export type CorrectivePriority = "low" | "medium" | "high" | "critical";
export type CorrectiveStatus = "open" | "in_progress" | "resolved" | "verified";
export type ShiftName = "day" | "night" | "general" | "special";

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

  // ── CORRECTIVE ACTIONS (QUALITY) ───────────────────────────────────────────

  async listCorrectiveActions(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, inspection_id, description, priority, status, assigned_to, due_date, opened_by, opened_at, verified_by, verified_at
         FROM corrective_actions
         WHERE project_id = ?
         ORDER BY opened_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createCorrectiveAction(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; description: string; priority?: CorrectivePriority; assignedTo?: string; dueDate?: string; inspectionId?: string }
  ) {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can create corrective actions.");
    await this.db
      .prepare(
        `INSERT INTO corrective_actions (id, project_id, inspection_id, description, priority, status, assigned_to, due_date, opened_by)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.inspectionId || null,
        input.description.trim(),
        input.priority || "medium",
        input.assignedTo || null,
        input.dueDate || null,
        ctx.userId
      )
      .run();
    return { id: input.id };
  }

  async updateCorrectiveActionStatus(
    ctx: SecurityContext,
    projectId: string,
    actionId: string,
    status: CorrectiveStatus
  ): Promise<boolean> {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can update corrective actions.");
    const res = await this.db
      .prepare(
        `UPDATE corrective_actions
         SET status = ?,
             verified_by = CASE WHEN ? = 'verified' THEN ? ELSE verified_by END,
             verified_at = CASE WHEN ? = 'verified' THEN datetime('now') ELSE verified_at END,
             updated_at = datetime('now')
         WHERE id = ? AND project_id = ?`
      )
      .bind(status, status, ctx.userId, status, actionId, projectId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ── SHIFT ROSTER ───────────────────────────────────────────────────────────

  async listShifts(ctx: SecurityContext, projectId: string, shiftDate?: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    if (shiftDate) {
      const { results } = await this.db
        .prepare(
          `SELECT id, project_id, labour_id, worker_name, shift_date, shift_name, start_time, end_time, notes, created_by, created_at
           FROM shift_roster
           WHERE project_id = ? AND shift_date = ?
           ORDER BY created_at DESC`
        )
        .bind(projectId, shiftDate)
        .all();
      return results || [];
    }
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, labour_id, worker_name, shift_date, shift_name, start_time, end_time, notes, created_by, created_at
         FROM shift_roster
         WHERE project_id = ?
         ORDER BY shift_date DESC, created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createShift(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; labourId?: string; workerName?: string; shiftDate?: string; shiftName?: ShiftName; startTime?: string; endTime?: string; notes?: string }
  ) {
    assertWriteRole(ctx);
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can schedule shifts.");
    await this.db
      .prepare(
        `INSERT INTO shift_roster (id, project_id, labour_id, worker_name, shift_date, shift_name, start_time, end_time, notes, created_by)
         VALUES (?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.labourId || null,
        input.workerName || null,
        input.shiftDate || null,
        input.shiftName || "day",
        input.startTime || null,
        input.endTime || null,
        input.notes || null,
        ctx.userId
      )
      .run();
    return { id: input.id };
  }
}
