/**
 * SiteTrack Pro — Cloudflare Workers Site Operations Repository
 *
 * Tenant-scoped D1 queries for tasks, milestones, DPR messages, and attendance.
 * Every query verifies project ownership or active cross-org partner membership.
 */

import { TenantSecurityError, type SecurityContext } from "../middleware/tenant";
import { assertProjectReadable } from "./projectAccess";

export class SiteOpsRepository {
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
    input: { id: string; title: string; description?: string; milestoneId?: string; priority?: string; dueDate?: string }
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
        ctx.userId,
        input.priority || "medium",
        input.dueDate || null
      )
      .run();
  }

  async updateTaskStatus(
    ctx: SecurityContext,
    projectId: string,
    taskId: string,
    status: "todo" | "in_progress" | "review" | "done"
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
    input: { id: string; title: string; description?: string; dueDate?: string; weight?: number }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can create milestones.");
    }
    await this.db
      .prepare(
        `INSERT INTO milestones (id, project_id, title, description, due_date, weight)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(input.id, projectId, input.title, input.description || null, input.dueDate || null, input.weight ?? 1.0)
      .run();
  }

  async listDprMessages(ctx: SecurityContext, projectId: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM dpr_messages WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createDprMessage(
    ctx: SecurityContext,
    projectId: string,
    input: { id: string; transcriptText?: string; voiceAudioUrl?: string; photoLat?: number; photoLon?: number }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can submit DPRs.");
    }
    await this.db
      .prepare(
        `INSERT INTO dpr_messages (id, project_id, supervisor_id, transcript_text, voice_audio_url, photo_lat, photo_lon)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        ctx.userId,
        input.transcriptText || null,
        input.voiceAudioUrl || null,
        input.photoLat ?? null,
        input.photoLon ?? null
      )
      .run();
  }

  async listAttendance(ctx: SecurityContext, projectId: string, date?: string) {
    await assertProjectReadable(this.db, ctx, projectId);
    if (date) {
      const { results } = await this.db
        .prepare(`SELECT * FROM attendance WHERE project_id = ? AND date = ? ORDER BY created_at DESC`)
        .bind(projectId, date)
        .all();
      return results || [];
    }
    const { results } = await this.db
      .prepare(`SELECT * FROM attendance WHERE project_id = ? ORDER BY date DESC, created_at DESC LIMIT 200`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async recordAttendance(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      attendeeKind: "labour" | "staff" | "visitor";
      attendeeName: string;
      labourId?: string;
      profileId?: string;
      date?: string;
      status?: string;
      inTime?: string;
      outTime?: string;
      hours?: number;
    }
  ) {
    const access = await assertProjectReadable(this.db, ctx, projectId);
    if (!access.isOwnerOrg) {
      throw new TenantSecurityError("Forbidden: Only owner organization members can record attendance.");
    }
    await this.db
      .prepare(
        `INSERT INTO attendance (id, project_id, attendee_kind, labour_id, profile_id, attendee_name, date, status, in_time, out_time, hours, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.attendeeKind,
        input.labourId || null,
        input.profileId || null,
        input.attendeeName,
        input.date || null,
        input.status || "present",
        input.inTime || null,
        input.outTime || null,
        input.hours ?? null,
        ctx.userId
      )
      .run();
  }
}
