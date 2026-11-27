/**
 * SiteTrack Pro — Cloudflare Workers CRM & Client Portal Repository
 *
 * Covers CRM pipeline (leads, lead_quotations) with strict org_id scoping,
 * and Client Portal / Approvals (drawing_comments, share_links, handover_signatures)
 * with project-level tenant & cross-org partner access checks on D1.
 */

import { TenantSecurityError, type SecurityContext } from "../middleware/tenant";
import { assertProjectOwnerOrg, assertProjectReadable } from "./projectAccess";

export class CrmAndPortalRepository {
  constructor(private db: D1Database) {}

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async assertLeadInOrg(ctx: SecurityContext, leadId: string): Promise<void> {
    const row = await this.db
      .prepare(`SELECT id FROM leads WHERE id = ? AND org_id = ?`)
      .bind(leadId, ctx.orgId)
      .first<{ id: string }>();

    if (!row) {
      throw new TenantSecurityError("Forbidden: Lead not found or outside tenant scope.");
    }
  }

  private async assertDrawingReadable(ctx: SecurityContext, drawingId: string): Promise<{ project_id: string; isOwnerOrg: boolean }> {
    const drawing = await this.db
      .prepare(`SELECT project_id FROM drawings WHERE id = ?`)
      .bind(drawingId)
      .first<{ project_id: string }>();

    if (!drawing) {
      throw new TenantSecurityError("Forbidden: Drawing not found or outside tenant scope.");
    }

    const access = await assertProjectReadable(this.db, ctx, drawing.project_id);
    return { project_id: drawing.project_id, isOwnerOrg: access.isOwnerOrg };
  }

  // ── CRM Leads (Org-scoped) ──────────────────────────────────────────────────

  async listLeads(ctx: SecurityContext, stage?: string) {
    if (stage) {
      const { results } = await this.db
        .prepare(`SELECT * FROM leads WHERE org_id = ? AND stage = ? ORDER BY created_at DESC`)
        .bind(ctx.orgId, stage)
        .all();
      return results || [];
    }
    const { results } = await this.db
      .prepare(`SELECT * FROM leads WHERE org_id = ? ORDER BY created_at DESC`)
      .bind(ctx.orgId)
      .all();
    return results || [];
  }

  async createLead(
    ctx: SecurityContext,
    input: {
      id: string;
      name: string;
      company?: string;
      phone?: string;
      email?: string;
      source?: string;
      budget?: number;
      stage?: string;
      notes?: string;
      ownerId?: string;
    }
  ) {
    await this.db
      .prepare(
        `INSERT INTO leads (id, org_id, name, company, phone, email, source, budget, stage, notes, owner_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        ctx.orgId,
        input.name,
        input.company ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.source ?? null,
        input.budget ?? null,
        input.stage ?? "new",
        input.notes ?? null,
        input.ownerId ?? null
      )
      .run();
  }

  async updateLead(
    ctx: SecurityContext,
    leadId: string,
    patch: {
      name?: string;
      company?: string | null;
      phone?: string | null;
      email?: string | null;
      source?: string | null;
      budget?: number | null;
      stage?: string;
      notes?: string | null;
      ownerId?: string | null;
      wonAmount?: number | null;
      lostReason?: string | null;
    }
  ): Promise<boolean> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (patch.name !== undefined) { sets.push("name = ?"); values.push(patch.name); }
    if (patch.company !== undefined) { sets.push("company = ?"); values.push(patch.company); }
    if (patch.phone !== undefined) { sets.push("phone = ?"); values.push(patch.phone); }
    if (patch.email !== undefined) { sets.push("email = ?"); values.push(patch.email); }
    if (patch.source !== undefined) { sets.push("source = ?"); values.push(patch.source); }
    if (patch.budget !== undefined) { sets.push("budget = ?"); values.push(patch.budget); }
    if (patch.stage !== undefined) { sets.push("stage = ?"); values.push(patch.stage); }
    if (patch.notes !== undefined) { sets.push("notes = ?"); values.push(patch.notes); }
    if (patch.ownerId !== undefined) { sets.push("owner_id = ?"); values.push(patch.ownerId); }
    if (patch.wonAmount !== undefined) { sets.push("won_amount = ?"); values.push(patch.wonAmount); }
    if (patch.lostReason !== undefined) { sets.push("lost_reason = ?"); values.push(patch.lostReason); }

    if (sets.length === 0) return false;
    sets.push("updated_at = datetime('now')");
    values.push(leadId, ctx.orgId);

    const res = await this.db
      .prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ? AND org_id = ?`)
      .bind(...values)
      .run();

    return (res.meta?.changes ?? 0) > 0;
  }

  // ── CRM Quotations (Lead -> Org scoped) ─────────────────────────────────────

  async listLeadQuotations(ctx: SecurityContext, leadId: string) {
    await this.assertLeadInOrg(ctx, leadId);
    const { results } = await this.db
      .prepare(`SELECT * FROM lead_quotations WHERE lead_id = ? ORDER BY created_at DESC`)
      .bind(leadId)
      .all();
    return results || [];
  }

  async createLeadQuotation(
    ctx: SecurityContext,
    leadId: string,
    input: {
      id: string;
      amount: number;
      status?: string;
      validUntil?: string;
    }
  ) {
    await this.assertLeadInOrg(ctx, leadId);
    await this.db
      .prepare(
        `INSERT INTO lead_quotations (id, lead_id, amount, status, valid_until)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(input.id, leadId, input.amount, input.status ?? "draft", input.validUntil ?? null)
      .run();
  }

  async updateLeadQuotation(
    ctx: SecurityContext,
    leadId: string,
    quotationId: string,
    patch: {
      amount?: number;
      status?: string;
      validUntil?: string | null;
    }
  ): Promise<boolean> {
    await this.assertLeadInOrg(ctx, leadId);
    const sets: string[] = [];
    const values: unknown[] = [];

    if (patch.amount !== undefined) { sets.push("amount = ?"); values.push(patch.amount); }
    if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
    if (patch.validUntil !== undefined) { sets.push("valid_until = ?"); values.push(patch.validUntil); }

    if (sets.length === 0) return false;
    values.push(quotationId, leadId);

    const res = await this.db
      .prepare(`UPDATE lead_quotations SET ${sets.join(", ")} WHERE id = ? AND lead_id = ?`)
      .bind(...values)
      .run();

    return (res.meta?.changes ?? 0) > 0;
  }

  // ── Client Approvals: Drawing Comments (Project-readable) ───────────────────

  async listDrawingComments(ctx: SecurityContext, drawingId: string) {
    await this.assertDrawingReadable(ctx, drawingId);
    const { results } = await this.db
      .prepare(`SELECT * FROM drawing_comments WHERE drawing_id = ? ORDER BY created_at ASC`)
      .bind(drawingId)
      .all();
    return results || [];
  }

  async createDrawingComment(
    ctx: SecurityContext,
    drawingId: string,
    input: {
      id: string;
      parentId?: string;
      x?: number;
      y?: number;
      body: string;
      status?: "open" | "in_progress" | "resolved" | "closed";
    }
  ) {
    await this.assertDrawingReadable(ctx, drawingId);
    await this.db
      .prepare(
        `INSERT INTO drawing_comments (id, drawing_id, parent_id, author_id, x, y, body, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        drawingId,
        input.parentId ?? null,
        ctx.userId,
        input.x ?? null,
        input.y ?? null,
        input.body,
        input.status ?? "open"
      )
      .run();
  }

  async updateDrawingComment(
    ctx: SecurityContext,
    drawingId: string,
    commentId: string,
    patch: {
      body?: string;
      status?: "open" | "in_progress" | "resolved" | "closed";
    }
  ): Promise<boolean> {
    await this.assertDrawingReadable(ctx, drawingId);
    const sets: string[] = [];
    const values: unknown[] = [];

    if (patch.body !== undefined) { sets.push("body = ?"); values.push(patch.body); }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      values.push(patch.status);
      if (patch.status === "resolved" || patch.status === "closed") {
        sets.push("resolved_at = datetime('now')");
      } else {
        sets.push("resolved_at = NULL");
      }
    }

    if (sets.length === 0) return false;
    values.push(commentId, drawingId);

    const res = await this.db
      .prepare(`UPDATE drawing_comments SET ${sets.join(", ")} WHERE id = ? AND drawing_id = ?`)
      .bind(...values)
      .run();

    return (res.meta?.changes ?? 0) > 0;
  }

  // ── Client Approvals: Share Links (Owner-org only) ──────────────────────────

  async listShareLinks(ctx: SecurityContext, projectId: string) {
    await assertProjectOwnerOrg(
      this.db,
      ctx,
      projectId,
      "Forbidden: Share links are restricted to the owner organization."
    );
    const { results } = await this.db
      .prepare(
        `SELECT id, project_id, token, label, expires_at, allow_download, max_views, views, revoked_at, created_by, created_at
         FROM share_links
         WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .bind(projectId)
      .all();
    return results || [];
  }

  async createShareLink(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      token: string;
      label?: string;
      passwordHash?: string;
      expiresAt?: string;
      allowDownload?: boolean;
      maxViews?: number;
    }
  ) {
    await assertProjectOwnerOrg(
      this.db,
      ctx,
      projectId,
      "Forbidden: Share links are restricted to the owner organization."
    );
    await this.db
      .prepare(
        `INSERT INTO share_links (id, project_id, token, label, password_hash, expires_at, allow_download, max_views, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.token,
        input.label ?? null,
        input.passwordHash ?? null,
        input.expiresAt ?? null,
        input.allowDownload === false ? 0 : 1,
        input.maxViews ?? null,
        ctx.userId
      )
      .run();
  }

  async updateShareLink(
    ctx: SecurityContext,
    projectId: string,
    shareLinkId: string,
    patch: {
      label?: string | null;
      expiresAt?: string | null;
      allowDownload?: boolean;
      maxViews?: number | null;
      revokedAt?: string | null;
    }
  ): Promise<boolean> {
    await assertProjectOwnerOrg(
      this.db,
      ctx,
      projectId,
      "Forbidden: Share links are restricted to the owner organization."
    );
    const sets: string[] = [];
    const values: unknown[] = [];

    if (patch.label !== undefined) { sets.push("label = ?"); values.push(patch.label); }
    if (patch.expiresAt !== undefined) { sets.push("expires_at = ?"); values.push(patch.expiresAt); }
    if (patch.allowDownload !== undefined) { sets.push("allow_download = ?"); values.push(patch.allowDownload ? 1 : 0); }
    if (patch.maxViews !== undefined) { sets.push("max_views = ?"); values.push(patch.maxViews); }
    if (patch.revokedAt !== undefined) { sets.push("revoked_at = ?"); values.push(patch.revokedAt); }

    if (sets.length === 0) return false;
    values.push(shareLinkId, projectId);

    const res = await this.db
      .prepare(`UPDATE share_links SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`)
      .bind(...values)
      .run();

    return (res.meta?.changes ?? 0) > 0;
  }

  // ── Client Approvals: Handover Signatures (Project-readable) ────────────────

  async listHandoverSignatures(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM handover_signatures WHERE project_id = ? ORDER BY signed_at DESC`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createHandoverSignature(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      signatureData: string;
    }
  ) {
    await assertProjectReadable(this.db, ctx, projectId);
    await this.db
      .prepare(
        `INSERT INTO handover_signatures (id, project_id, signature_data, signed_by)
         VALUES (?, ?, ?, ?)`
      )
      .bind(input.id, projectId, input.signatureData, ctx.userId)
      .run();
  }
}
