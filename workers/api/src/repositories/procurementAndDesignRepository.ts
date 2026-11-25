/**
 * SiteTrack Pro — Cloudflare Workers Procurement, BOQ, Drawings & Notifications Repository
 *
 * Covers Wave 3 domain modules on D1 with strict tenant and partner isolation.
 */

import type { SecurityContext } from "../middleware/tenant";
import { assertProjectOwnerOrg, assertProjectReadable } from "./projectAccess";

export class ProcurementAndDesignRepository {
  constructor(private db: D1Database) {}

  // ── BOQ Items (Owner-org only) ─────────────────────────────────────────────

  async listBoqItems(ctx: SecurityContext, projectId: string) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: BOQ is restricted to the owner organization.");
    const { results } = await this.db
      .prepare(`SELECT * FROM boq_items WHERE project_id = ? ORDER BY created_at ASC`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createBoqItem(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; itemCode?: string; itemName: string; unit?: string; qty: number; rate: number }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: BOQ is restricted to the owner organization.");
    const amount = Math.round(input.qty * input.rate * 100) / 100;
    await this.db
      .prepare(
        `INSERT INTO boq_items (id, project_id, item_code, item_name, unit, qty, rate, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(input.id, projectId, input.itemCode || null, input.itemName, input.unit || null, input.qty, input.rate, amount)
      .run();
  }

  // ── Vendors (Org-scoped) ───────────────────────────────────────────────────

  async listVendors(ctx: SecurityContext) {
    const { results } = await this.db
      .prepare(`SELECT * FROM vendors WHERE org_id = ? ORDER BY name ASC`)
      .bind(ctx.orgId)
      .all();
    return results || [];
  }

  async createVendor(
    ctx: SecurityContext,
    input: { id: string; name: string; contactPerson?: string; phone?: string; email?: string; gstin?: string; category?: string }
  ) {
    await this.db
      .prepare(
        `INSERT INTO vendors (id, org_id, name, contact_person, phone, email, gstin, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        ctx.orgId,
        input.name,
        input.contactPerson || null,
        input.phone || null,
        input.email || null,
        input.gstin || null,
        input.category || "materials"
      )
      .run();
  }

  // ── Purchase Orders (Owner-org only) ───────────────────────────────────────

  async listPurchaseOrders(ctx: SecurityContext, projectId: string) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Purchase orders are restricted to the owner organization.");
    const { results } = await this.db
      .prepare(
        `SELECT po.*, v.name AS vendor_name
         FROM purchase_orders po
         LEFT JOIN vendors v ON v.id = po.vendor_id
         WHERE po.project_id = ?
         ORDER BY po.created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createPurchaseOrder(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; vendorId: string; poNumber: string; totalAmount: number; taxAmount?: number }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Purchase orders are restricted to the owner organization.");
    await this.db
      .prepare(
        `INSERT INTO purchase_orders (id, project_id, vendor_id, po_number, total_amount, tax_amount, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(input.id, projectId, input.vendorId, input.poNumber, input.totalAmount, input.taxAmount ?? 0, ctx.userId)
      .run();
  }

  // ── Drawings (Partner-readable, Owner-org writable) ────────────────────────

  async listDrawings(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM drawings WHERE project_id = ? ORDER BY updated_at DESC`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createDrawing(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      title: string;
      discipline?: string;
      drawingNumber: string;
      currentFileKey: string;
      fileFormat?: string;
      status?: string;
    }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only owner organization members can upload drawings.");
    await this.db
      .prepare(
        `INSERT INTO drawings (id, project_id, title, discipline, drawing_number, current_file_key, file_format, status, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.title,
        input.discipline || "architectural",
        input.drawingNumber,
        input.currentFileKey,
        input.fileFormat || "pdf",
        input.status || "for_construction",
        ctx.userId
      )
      .run();
  }

  // ── Notifications (User + Org scoped) ──────────────────────────────────────

  async listNotifications(ctx: SecurityContext) {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM notifications
         WHERE user_id = ? AND (org_id IS NULL OR org_id = ?)
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .bind(ctx.userId, ctx.orgId)
      .all();
    return results || [];
  }

  async markNotificationRead(ctx: SecurityContext, notificationId: string) {
    const res = await this.db
      .prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`)
      .bind(notificationId, ctx.userId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }
}
