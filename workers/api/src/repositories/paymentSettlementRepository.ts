/**
 * SiteTrack Pro — Cloudflare Workers Payment Settlement & Canonical Pricing Repository
 *
 * Centralizes Migration-94 canonical plan pricing (with 18% GST) and idempotent
 * Razorpay webhook settlement for both plan upgrades and project invoices in D1.
 */

export type PaidPlanId = "basic" | "pro" | "business";
export type BillingPeriod = "monthly" | "annual";

export const GST_RATE = 0.18;

/** Canonical pre-GST prices in paise (matches scripts/supabase/94_plans_pricing_refine.sql). */
export const CANONICAL_PLAN_PRICES_PAISE: Record<PaidPlanId, Record<BillingPeriod, number>> = {
  basic: { monthly: 599900, annual: 5999000 },
  pro: { monthly: 1199900, annual: 11999000 },
  business: { monthly: 1999900, annual: 19999000 },
};

export function computeGstInclusivePaise(basePaise: number): number {
  const inrInclGst = Math.round((basePaise / 100) * (1 + GST_RATE));
  return Math.round(inrInclGst * 100);
}

export function mapRazorpayStatus(eventType: string): "paid" | "failed" | "cancelled" | "expired" | "partial" | "pending" {
  switch (eventType) {
    case "payment.captured":
    case "payment_link.paid":
      return "paid";
    case "payment.failed":
      return "failed";
    case "payment.refunded":
    case "payment_link.cancelled":
      return "cancelled";
    case "payment.expired":
    case "payment_link.expired":
      return "expired";
    case "payment.partially_refunded":
    case "payment_link.partially_paid":
      return "partial";
    default:
      return "pending";
  }
}

export interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment_link?: { entity?: Record<string, unknown> };
    payment?: { entity?: Record<string, unknown> };
  };
}

export class PaymentSettlementRepository {
  constructor(private db: D1Database) {}

  async resolvePlanAmountPaise(plan: PaidPlanId, period: BillingPeriod): Promise<number> {
    const row = await this.db
      .prepare(`SELECT monthly_inr, yearly_inr FROM plans WHERE id = ?`)
      .bind(plan)
      .first<{ monthly_inr: number | null; yearly_inr: number | null }>();

    const dbBasePaise = period === "annual" ? Number(row?.yearly_inr ?? 0) : Number(row?.monthly_inr ?? 0);
    const basePaise = dbBasePaise > 0 ? dbBasePaise : CANONICAL_PLAN_PRICES_PAISE[plan][period];
    return computeGstInclusivePaise(basePaise);
  }

  async settleWebhook(
    parsed: RazorpayWebhookPayload,
    eventId = ""
  ): Promise<{ ok: boolean; status?: string; already_paid?: boolean; ignored?: boolean; invoice_id?: string; plan?: boolean; message?: string }> {
    const eventType = parsed.event || "";
    const payload = parsed.payload || {};
    const paymentLinkEntity = payload.payment_link?.entity;
    const paymentEntity = payload.payment?.entity;
    const entity = paymentLinkEntity || paymentEntity || {};

    const paymentLinkId = String(paymentLinkEntity?.id || entity.razorpay_payment_link_id || "");
    const notes = (entity.notes || {}) as Record<string, unknown>;
    const notesPlanPaymentId = String(notes.sitetrack_plan_payment_id || "");
    const notesInvoiceId = String(notes.sitetrack_invoice_id || "");

    if (notesPlanPaymentId && notesPlanPaymentId !== "null" && notesPlanPaymentId !== "undefined") {
      return this.handlePlanPayment(notesPlanPaymentId, eventType, paymentLinkId, paymentEntity);
    }

    if (notesInvoiceId && notesInvoiceId !== "null" && notesInvoiceId !== "undefined") {
      return this.handleInvoicePayment(notesInvoiceId, eventType, paymentLinkId, paymentEntity, eventId);
    }

    if (paymentLinkId && paymentLinkId !== "null" && paymentLinkId !== "undefined") {
      const planPay = await this.db
        .prepare(`SELECT id FROM plan_payments WHERE link_id = ?`)
        .bind(paymentLinkId)
        .first<{ id: string }>();
      if (planPay?.id) {
        return this.handlePlanPayment(planPay.id, eventType, paymentLinkId, paymentEntity);
      }
    }

    return { ok: true, ignored: true, message: "no matching invoice or plan payment" };
  }

  private async handlePlanPayment(
    ppId: string,
    eventType: string,
    paymentLinkId: string,
    paymentEntity?: Record<string, unknown>
  ) {
    const pay = await this.db
      .prepare(`SELECT id, org_id, plan, period, amount_paise, status FROM plan_payments WHERE id = ?`)
      .bind(ppId)
      .first<{ id: string; org_id: string; plan: string; period: string; amount_paise: number; status: string }>();

    if (!pay) {
      return { ok: true, ignored: true, message: "unknown plan payment" };
    }

    const newStatus = mapRazorpayStatus(eventType);
    if (newStatus !== "paid") {
      if (newStatus !== "pending" && pay.status === "pending") {
        await this.db
          .prepare(`UPDATE plan_payments SET status = ? WHERE id = ? AND status = 'pending'`)
          .bind(newStatus, ppId)
          .run();
      }
      return { ok: true, ignored: true };
    }

    if (pay.status === "paid") {
      return { ok: true, already_paid: true };
    }
    if (pay.status !== "pending") {
      return { ok: true, ignored: true, message: "ignored late paid echo" };
    }

    const now = new Date().toISOString();
    const periodEnd = new Date(
      Date.now() + (pay.period === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000
    ).toISOString();
    const reference = paymentLinkId && paymentLinkId !== "null" && paymentLinkId !== "undefined" ? paymentLinkId : ppId;

    const settleRes = await this.db
      .prepare(`UPDATE plan_payments SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'`)
      .bind(now, ppId)
      .run();
    if ((settleRes.meta?.changes ?? 0) === 0) {
      return { ok: true, already_paid: true };
    }

    await this.db
      .prepare(`UPDATE organizations SET plan = ?, billing_period = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(pay.plan, pay.period, pay.org_id)
      .run();

    const existingSub = await this.db
      .prepare(`SELECT id FROM subscriptions WHERE org_id = ?`)
      .bind(pay.org_id)
      .first<{ id: string }>();

    if (existingSub?.id) {
      await this.db
        .prepare(
          `UPDATE subscriptions
           SET plan = ?, status = 'active', provider = 'razorpay', billing_period = ?,
               current_period_start = ?, current_period_end = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(pay.plan, pay.period, now, periodEnd, existingSub.id)
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO subscriptions (id, org_id, plan, status, provider, billing_period, current_period_start, current_period_end)
           VALUES (?, ?, ?, 'active', 'razorpay', ?, ?, ?)`
        )
        .bind(`sub_${crypto.randomUUID()}`, pay.org_id, pay.plan, pay.period, now, periodEnd)
        .run();
    }

    const chargedPaise = Number.isFinite(Number(paymentEntity?.amount)) ? Number(paymentEntity?.amount) : pay.amount_paise;
    const gstPaise = chargedPaise > 0 ? chargedPaise - Math.round(chargedPaise / (1 + GST_RATE)) : 0;

    const existingHistory = await this.db
      .prepare(`SELECT id FROM billing_history WHERE org_id = ? AND external_id = ?`)
      .bind(pay.org_id, reference)
      .first<{ id: string }>();

    if (!existingHistory) {
      await this.db
        .prepare(
          `INSERT INTO billing_history (id, org_id, provider, external_id, amount, currency, gst, status, paid_at, receipt_no, payload)
           VALUES (?, ?, 'razorpay', ?, ?, 'INR', ?, 'succeeded', ?, ?, ?)`
        )
        .bind(
          `bh_${crypto.randomUUID()}`,
          pay.org_id,
          reference,
          chargedPaise,
          gstPaise,
          now,
          reference,
          JSON.stringify({ plan: pay.plan, period: pay.period, source: "plan_upgrade", event: eventType })
        )
        .run();
    }

    await this.db
      .prepare(
        `INSERT INTO audit_log_v2 (id, org_id, action, resource, resource_id, after, message)
         VALUES (?, ?, 'PAYMENT', 'subscription', ?, ?, ?)`
      )
      .bind(
        `aud_${crypto.randomUUID()}`,
        pay.org_id,
        pay.org_id,
        JSON.stringify({ plan: pay.plan, period: pay.period, amount_paise: chargedPaise, reference }),
        `Org subscription activated by payment: ${pay.org_id} -> ${pay.plan} (${pay.period})`
      )
      .run();

    return { ok: true, status: "paid", plan: true };
  }

  private async handleInvoicePayment(
    invoiceId: string,
    eventType: string,
    paymentLinkId: string,
    paymentEntity: Record<string, unknown> | undefined,
    eventId: string
  ) {
    const newStatus = mapRazorpayStatus(eventType);
    if (newStatus === "pending") {
      return { ok: true, ignored: true };
    }

    const inv = await this.db
      .prepare(`SELECT id, total_amount, created_by FROM invoices WHERE id = ?`)
      .bind(invoiceId)
      .first<{ id: string; total_amount: number; created_by: string }>();

    if (!inv) {
      return { ok: true, ignored: true, message: "invoice not found" };
    }

    if (newStatus === "paid" || newStatus === "partial") {
      const paymentId = String(paymentEntity?.id || "");
      const reference = paymentId || paymentLinkId || eventId || `rzp_${invoiceId}`;
      const dup = await this.db
        .prepare(`SELECT id FROM payments WHERE invoice_id = ? AND reference_number = ?`)
        .bind(invoiceId, reference)
        .first<{ id: string }>();

      if (!dup) {
        const eventPaise = Number(paymentEntity?.amount ?? NaN);
        const rupees =
          Number.isFinite(eventPaise) && eventPaise > 0
            ? Math.round(eventPaise / 100)
            : Math.round(Number(inv.total_amount ?? 0));
        if (rupees > 0) {
          await this.db
            .prepare(
              `INSERT INTO payments (id, invoice_id, amount, payment_date, method, reference_number, recorded_by)
               VALUES (?, ?, ?, ?, 'razorpay', ?, ?)`
            )
            .bind(
              `pay_${crypto.randomUUID()}`,
              invoiceId,
              rupees,
              new Date().toISOString().slice(0, 10),
              reference,
              inv.created_by
            )
            .run();
        }
      }

      const invoiceStatus = newStatus === "paid" ? "paid" : "partially_paid";
      await this.db
        .prepare(`UPDATE invoices SET status = ? WHERE id = ?`)
        .bind(invoiceStatus, invoiceId)
        .run();
    }

    return { ok: true, invoice_id: invoiceId, status: newStatus };
  }
}
