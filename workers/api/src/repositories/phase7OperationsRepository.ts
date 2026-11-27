/**
 * SiteTrack Pro — Phase 7 Operations Repository (BOQ, Inventory, Labour, Attendance, Team Chat)
 *
 * Implements D1-backed operations for:
 *   - boq_items
 *   - inventory_transactions
 *   - labour_register
 *   - attendance
 *   - chat_channels & chat_messages
 */

import { TenantSecurityError, type SecurityContext } from "../middleware/tenant";
import { assertProjectOwnerOrg, assertProjectReadable } from "./projectAccess";

export type BoqStatus = "pending" | "approved" | "ordered" | "received";
export type InventoryDirection = "inward" | "outward" | "return" | "wastage";
export type AttendanceKind = "labour" | "staff" | "visitor";
export type AttendanceStatus = "present" | "absent" | "half_day" | "leave" | "on_site_late" | "off_site";

export class Phase7OperationsRepository {
  constructor(private db: D1Database) {}

  // ── BOQ ITEMS ───────────────────────────────────────────────────────────────

  async listBoqItems(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, item_code, item_name, unit, qty, rate, amount, status, created_at
         FROM boq_items
         WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createBoqItem(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; itemCode?: string; itemName: string; unit?: string; qty: number; rate: number; status?: BoqStatus }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can create BOQ items.");
    const amount = Number(input.qty) * Number(input.rate);
    await this.db
      .prepare(
        `INSERT INTO boq_items (id, project_id, item_code, item_name, unit, qty, rate, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.itemCode || null,
        input.itemName.trim(),
        input.unit || null,
        input.qty,
        input.rate,
        amount,
        input.status || "pending"
      )
      .run();
    return { id: input.id, amount };
  }

  async updateBoqItemStatus(ctx: SecurityContext, projectId: string, itemId: string, status: BoqStatus): Promise<boolean> {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can update BOQ items.");
    const res = await this.db
      .prepare(`UPDATE boq_items SET status = ? WHERE id = ? AND project_id = ?`)
      .bind(status, itemId, projectId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ── INVENTORY TRANSACTIONS ──────────────────────────────────────────────────

  async listInventoryTransactions(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, txn_date, material, unit, qty, direction, source, ref_no, po_id, recorded_by, notes, attachments, created_at
         FROM inventory_transactions
         WHERE project_id = ?
         ORDER BY txn_date DESC, created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async recordInventoryTransaction(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      txnDate?: string;
      material: string;
      unit?: string;
      qty: number;
      direction: InventoryDirection;
      source?: string;
      refNo?: string;
      poId?: string;
      notes?: string;
    }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can record inventory.");
    if (!(Number(input.qty) > 0)) {
      throw new Error("qty must be > 0");
    }
    await this.db
      .prepare(
        `INSERT INTO inventory_transactions (id, project_id, txn_date, material, unit, qty, direction, source, ref_no, po_id, recorded_by, notes)
         VALUES (?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.txnDate || null,
        input.material.trim(),
        input.unit || null,
        input.qty,
        input.direction,
        input.source || null,
        input.refNo || null,
        input.poId || null,
        ctx.userId,
        input.notes || null
      )
      .run();
    return { id: input.id };
  }

  // ── LABOUR & ATTENDANCE ─────────────────────────────────────────────────────

  async listLabourRegister(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, name, trade, wage, joined
         FROM labour_register
         WHERE project_id = ?
         ORDER BY name ASC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createLabourWorker(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; name: string; trade?: string; wage?: number; joined?: string }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can register labour.");
    await this.db
      .prepare(
        `INSERT INTO labour_register (id, project_id, name, trade, wage, joined)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(input.id, projectId, input.name.trim(), input.trade || null, input.wage ?? null, input.joined || null)
      .run();
    return { id: input.id };
  }

  async listAttendance(ctx: SecurityContext, projectId: string, date?: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    if (date) {
      const { results } = await this.db
        .prepare(
          `SELECT id, project_id, attendee_kind, labour_id, profile_id, attendee_name, date, status, in_time, out_time, hours, source, recorded_by, created_at
           FROM attendance
           WHERE project_id = ? AND date = ?
           ORDER BY created_at DESC`
        )
        .bind(projectId, date)
        .all();
      return results || [];
    }
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, attendee_kind, labour_id, profile_id, attendee_name, date, status, in_time, out_time, hours, source, recorded_by, created_at
         FROM attendance
         WHERE project_id = ?
         ORDER BY date DESC, created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async recordAttendance(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      attendeeKind: AttendanceKind;
      labourId?: string;
      profileId?: string;
      attendeeName: string;
      date?: string;
      status?: AttendanceStatus;
      inTime?: string;
      outTime?: string;
      hours?: number;
      source?: string;
    }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId, "Forbidden: Only the owner organization can mark attendance.");
    await this.db
      .prepare(
        `INSERT INTO attendance (id, project_id, attendee_kind, labour_id, profile_id, attendee_name, date, status, in_time, out_time, hours, source, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.attendeeKind,
        input.labourId || null,
        input.profileId || null,
        input.attendeeName.trim(),
        input.date || null,
        input.status || "present",
        input.inTime || null,
        input.outTime || null,
        input.hours ?? null,
        input.source || "web",
        ctx.userId
      )
      .run();
    return { id: input.id };
  }

  // ── TEAM CHAT ───────────────────────────────────────────────────────────────

  async listChatChannels(ctx: SecurityContext) {
    const { results } = await this.db
      .prepare(
        `SELECT id, org_id, name, description, created_by, is_archived, created_at
         FROM chat_channels
         WHERE org_id = ? AND is_archived = 0
         ORDER BY name ASC`
      )
      .bind(ctx.orgId)
      .all();
    return results || [];
  }

  async createChatChannel(ctx: SecurityContext, input: { id: string; name: string; description?: string }) {
    const cleanName = input.name.trim();
    if (!cleanName || cleanName.length > 80) {
      throw new Error("Channel name must be 1-80 characters");
    }
    await this.db
      .prepare(
        `INSERT INTO chat_channels (id, org_id, name, description, created_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(input.id, ctx.orgId, cleanName, input.description || null, ctx.userId)
      .run();
    return { id: input.id, name: cleanName };
  }

  private async assertChannelInOrg(ctx: SecurityContext, channelId: string): Promise<void> {
    const ch = await this.db
      .prepare(`SELECT id FROM chat_channels WHERE id = ? AND org_id = ?`)
      .bind(channelId, ctx.orgId)
      .first<{ id: string }>();
    if (!ch) {
      throw new TenantSecurityError("Forbidden: Chat channel not found or outside tenant scope.");
    }
  }

  async listChatMessages(ctx: SecurityContext, channelId: string) {
    await this.assertChannelInOrg(ctx, channelId);
    const { results } = await this.db
      .prepare(
        `SELECT id, org_id, channel_id, parent_id, sender_id, sender_name, body, mentions, reply_count, created_at
         FROM chat_messages
         WHERE org_id = ? AND channel_id = ?
         ORDER BY created_at ASC`
      )
      .bind(ctx.orgId, channelId)
      .all();
    return results || [];
  }

  async postChatMessage(
    ctx: SecurityContext,
    channelId: string,
    input: { id: string; body: string; parentId?: string; senderName?: string; mentions?: string[] }
  ) {
    await this.assertChannelInOrg(ctx, channelId);
    const body = input.body.trim();
    if (!body || body.length > 4000) {
      throw new Error("Message body must be 1-4000 characters");
    }
    await this.db
      .prepare(
        `INSERT INTO chat_messages (id, org_id, channel_id, parent_id, sender_id, sender_name, body, mentions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        ctx.orgId,
        channelId,
        input.parentId || null,
        ctx.userId,
        input.senderName || ctx.email,
        body,
        JSON.stringify(input.mentions || [])
      )
      .run();

    if (input.parentId) {
      await this.db
        .prepare(`UPDATE chat_messages SET reply_count = reply_count + 1 WHERE id = ? AND org_id = ?`)
        .bind(input.parentId, ctx.orgId)
        .run();
    }
    return { id: input.id };
  }
}
