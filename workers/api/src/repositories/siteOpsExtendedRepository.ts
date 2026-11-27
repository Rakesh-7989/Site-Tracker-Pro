/**
 * SiteTrack Pro — Cloudflare Workers Extended Site Operations Repository
 *
 * Tenant-scoped D1 queries for material requests, safety incidents,
 * inspections, punch items, and measurement book entries.
 * Every query verifies project ownership or active cross-org partner membership.
 */

import { TenantSecurityError, type SecurityContext } from "../middleware/tenant";
import { assertProjectReadable } from "./projectAccess";

export class SiteOpsExtendedRepository {
  constructor(private db: D1Database) {}

  // ── Material Requests (table: material_requests) ──────────────────────────

  async listMaterialRequests(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM material_requests WHERE project_id = ? ORDER BY created_at DESC LIMIT 200`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createMaterialRequest(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      item: string;
      unit?: string;
      qty: number;
      needDate?: string;
      reason?: string;
      notes?: string;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can create material requests.");
    }
    await this.db
      .prepare(
        `INSERT INTO material_requests (id, project_id, item, unit, qty, need_date, reason, requested_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.item,
        input.unit || null,
        input.qty,
        input.needDate || null,
        input.reason || null,
        ctx.userId,
        input.notes || null
      )
      .run();
  }

  // ── Safety Incidents (table: safety) ──────────────────────────────────────

  async listSafetyIncidents(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM safety WHERE project_id = ? ORDER BY incident_date DESC, created_at DESC LIMIT 200`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createSafetyIncident(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      description: string;
      severity: "near_miss" | "first_aid" | "minor" | "major" | "fatal";
      category?: string;
      location?: string;
      actionTaken?: string;
      incidentDate?: string;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can report safety incidents.");
    }
    await this.db
      .prepare(
        `INSERT INTO safety (id, project_id, incident_date, severity, category, description, location, reported_by, action_taken)
         VALUES (?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.incidentDate || null,
        input.severity,
        input.category || null,
        input.description,
        input.location || null,
        ctx.userId,
        input.actionTaken || null
      )
      .run();
  }

  // ── Inspections (table: inspections) ──────────────────────────────────────

  async listInspections(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM inspections WHERE project_id = ? ORDER BY scheduled_date DESC, created_at DESC LIMIT 200`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createInspection(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      type: string;
      scope?: string;
      scheduledDate?: string;
      inspectorName?: string;
      observations?: string;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can schedule inspections.");
    }
    await this.db
      .prepare(
        `INSERT INTO inspections (id, project_id, type, scheduled_date, inspector_name, inspector_id, scope, result, observations)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .bind(
        input.id,
        projectId,
        input.type,
        input.scheduledDate || null,
        input.inspectorName || null,
        ctx.userId,
        input.scope || null,
        input.observations || null
      )
      .run();
  }

  // ── Punch List (table: punch) ─────────────────────────────────────────────

  async listPunchItems(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM punch WHERE project_id = ? ORDER BY created_at DESC LIMIT 200`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createPunchItem(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      location: string;
      defect: string;
      trade?: string;
      severity?: string;
      unitId?: string;
      assignedTo?: string;
      dueDate?: string;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can create punch items.");
    }
    await this.db
      .prepare(
        `INSERT INTO punch (id, project_id, unit_id, location, trade, defect, severity, reported_by, reported_date, assigned_to, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.unitId || null,
        input.location,
        input.trade || null,
        input.defect,
        input.severity || "medium",
        ctx.userId,
        input.assignedTo || null,
        input.dueDate || null
      )
      .run();
  }

  // ── Measurement Book (table: measurement_book) ────────────────────────────

  async listMeasurementBook(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM measurement_book WHERE project_id = ? ORDER BY measured_at DESC, created_at DESC LIMIT 200`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createMeasurementBookEntry(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      mbNo: string;
      pageNo?: number;
      boqItemId?: string;
      description: string;
      location?: string;
      blockId?: string;
      floorId?: string;
      unit?: string;
      length?: number;
      breadth?: number;
      depth?: number;
      qty: number;
      rate?: number;
      notes?: string;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can create measurement book entries.");
    }
    const amount = input.rate != null ? Math.round(input.qty * input.rate * 100) / 100 : null;
    await this.db
      .prepare(
        `INSERT INTO measurement_book (
           id, project_id, mb_no, page_no, boq_item_id, description, location,
           block_id, floor_id, unit, length, breadth, depth, qty, rate, amount,
           measured_by, measured_at, status, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'recorded', ?)`
      )
      .bind(
        input.id,
        projectId,
        input.mbNo,
        input.pageNo ?? null,
        input.boqItemId || null,
        input.description,
        input.location || null,
        input.blockId || null,
        input.floorId || null,
        input.unit || null,
        input.length ?? null,
        input.breadth ?? null,
        input.depth ?? null,
        input.qty,
        input.rate ?? null,
        amount,
        ctx.userId,
        input.notes || null
      )
      .run();
  }
}
