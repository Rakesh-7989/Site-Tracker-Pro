/**
 * SiteTrack Pro — Cloudflare Workers Org Admin, Signup & Webhook Repository
 *
 * Ports Edge Functions: invite_org_member, remove_org_member, submit_signup_request,
 * razorpay-plan-link, resend-webhook, and refresh_dau_rollup to Cloudflare D1.
 */

import { TenantSecurityError, type SecurityContext } from "../middleware/tenant";

export class OrgAdminRepository {
  constructor(private db: D1Database) {}

  async inviteOrgMember(
    ctx: SecurityContext,
    input: { id: string; email: string; role: string; token: string }
  ) {
    if (!ctx.isAdmin) {
      throw new TenantSecurityError("Forbidden: Only organization admins can invite members.");
    }
    const normalizedEmail = input.email.toLowerCase().trim();
    await this.db
      .prepare(
        `INSERT INTO org_invitations (id, org_id, email, role, invited_by, token, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      )
      .bind(input.id, ctx.orgId, normalizedEmail, input.role, ctx.userId, input.token)
      .run();
  }

  async removeOrgMember(ctx: SecurityContext, targetProfileId: string): Promise<boolean> {
    if (!ctx.isAdmin) {
      throw new TenantSecurityError("Forbidden: Only organization admins can remove members.");
    }
    if (targetProfileId === ctx.userId) {
      throw new TenantSecurityError("Forbidden: Cannot remove yourself from the organization.");
    }
    const res = await this.db
      .prepare(
        `UPDATE org_members
         SET status = 'removed', removed_at = datetime('now')
         WHERE org_id = ? AND profile_id = ? AND status != 'removed'`
      )
      .bind(ctx.orgId, targetProfileId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async submitSignupRequest(input: {
    id: string;
    firmName: string;
    contactName: string;
    email: string;
    phone?: string;
    plan?: string;
    message?: string;
  }) {
    const plan = ["basic", "pro", "business", "custom"].includes(input.plan || "")
      ? input.plan!
      : "basic";
    await this.db
      .prepare(
        `INSERT INTO signup_requests (id, firm_name, contact_name, email, phone, plan, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.firmName.trim(),
        input.contactName.trim(),
        input.email.toLowerCase().trim(),
        input.phone || null,
        plan,
        input.message || null
      )
      .run();
  }

  async recordPlanPayment(
    ctx: SecurityContext,
    input: { id: string; plan: "basic" | "pro" | "business"; period: "monthly" | "annual"; amountPaise: number; linkId: string }
  ) {
    if (!ctx.isAdmin) {
      throw new TenantSecurityError("Forbidden: Only organization admins can initiate plan upgrades.");
    }
    await this.db
      .prepare(
        `INSERT INTO plan_payments (id, org_id, plan, period, amount_paise, link_id, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      )
      .bind(input.id, ctx.orgId, input.plan, input.period, input.amountPaise, input.linkId)
      .run();
  }

  async recordResendEvent(input: {
    id: string;
    event: string;
    rawEvent: string;
    messageId?: string;
    toEmail?: string;
    subject?: string;
    payload: unknown;
  }) {
    const allowed = new Set(["sent", "delivered", "delivery_delayed", "complained", "bounced", "opened", "clicked"]);
    const normalized = allowed.has(input.event) ? input.event : "sent";
    await this.db
      .prepare(
        `INSERT INTO resend_delivery_events (id, event, raw_event, message_id, to_email, subject, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        normalized,
        input.rawEvent,
        input.messageId || null,
        input.toEmail || null,
        input.subject || null,
        JSON.stringify(input.payload ?? {})
      )
      .run();
  }

  async refreshDailyUsageRollup(): Promise<number> {
    const day = new Date().toISOString().slice(0, 10);
    const { results } = await this.db
      .prepare(
        `SELECT org_id, COUNT(DISTINCT actor_id) AS dau
         FROM audit_log_v2
         WHERE org_id IS NOT NULL AND substr(ts, 1, 10) = ?
         GROUP BY org_id`
      )
      .bind(day)
      .all<{ org_id: string; dau: number }>();

    let count = 0;
    for (const row of results || []) {
      await this.db
        .prepare(
          `INSERT INTO usage_metrics (org_id, day, metric, value, updated_at)
           VALUES (?, ?, 'dau', ?, datetime('now'))
           ON CONFLICT (org_id, day, metric) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
        )
        .bind(row.org_id, day, row.dau)
        .run();
      count++;
    }
    return count;
  }
}
