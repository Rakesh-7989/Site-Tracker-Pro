// SiteTrack Pro — Razorpay webhook handler.
//
// Razorpay POSTs events here when a payment link is paid, failed, or
// expired. We verify the HMAC-SHA256 signature, then update the invoice
// status accordingly.
//
// Webhook events we handle (entity nested under payload.<type>.entity):
//   payment.captured         → invoice.paid
//   payment.failed           → invoice.failed
//   payment.expired          → invoice.expired
//   payment.refunded         → invoice.cancelled
//   payment.partially_refunded → invoice.partial
//   payment_link.paid        → invoice.paid
//   payment_link.cancelled   → invoice.cancelled
//   payment_link.expired     → invoice.expired
//   payment_link.partially_paid → invoice.partial
//
// The invoice is resolved from the payment-link notes (sitetrack_invoice_id),
// falling back to a search by razorpay_payment_link_id on the invoices table.
//
// Plan-upgrade payments (links minted by razorpay-plan-link) carry
// notes.sitetrack_plan_payment_id → the pending plan_payments row is settled
// and the org's plan activated (mirrors cashfree-webhook's B2 handler). When
// notes are absent on payment.* events we fall back to a plan_payments.link_id
// match before acking.
//
// For all other events we return 200 (ack) so Razorpay stops retrying.
//
// Deploy:
//   supabase functions deploy razorpay-webhook --no-verify-jwt
//
// Then in the Razorpay dashboard → Settings → Webhooks, set:
//   https://<proj>.supabase.co/functions/v1/razorpay-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyRazorpaySignature, mapRazorpayStatus } from "../_shared/razorpay.ts";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
const RAZORPAY_WEBHOOK_SECRET_FALLBACK = Deno.env.get("RAZORPAY_KEY_SECRET");

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  const eventId = req.headers.get("x-razorpay-event-id") || "";

  const secret = WEBHOOK_SECRET || RAZORPAY_WEBHOOK_SECRET_FALLBACK;
  if (!(await verifyRazorpaySignature({ rawBody, signature, secret }))) {
    console.warn("Razorpay webhook signature invalid", { eventId, sigPrefix: signature.slice(0, 8) });
    return new Response("Invalid signature", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    return new Response("Service not configured", { status: 500 });
  }

  let parsed: { event?: string; payload?: Record<string, { entity?: Record<string, unknown> }> };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createClient(url, serviceRole);

  const eventType = parsed.event || "";
  const payload = parsed.payload || {};

  // Razorpay nests the affected entity under payload.payment_link.entity for
  // payment_link.* events, or payload.payment.entity for payment.* events.
  const paymentLinkEntity = payload.payment_link?.entity as Record<string, unknown> | undefined;
  const paymentEntity = payload.payment?.entity as Record<string, unknown> | undefined;
  const entity = paymentLinkEntity || paymentEntity || {};

  const paymentLinkId = String(
    paymentLinkEntity?.id || entity.razorpay_payment_link_id || "",
  );
  const notes = (entity.notes || {}) as Record<string, unknown>;
  const notesPlanPaymentId = String(notes.sitetrack_plan_payment_id || "");

  // Plan-upgrade payments (links minted by razorpay-plan-link) carry
  // notes.sitetrack_plan_payment_id → settle the pending row + activate.
  if (notesPlanPaymentId && notesPlanPaymentId !== "null" && notesPlanPaymentId !== "undefined") {
    return await handlePlanPayment({
      supabase,
      ppId: notesPlanPaymentId,
      eventType,
      paymentLinkId,
      paymentEntity,
      resendKey: Deno.env.get("RESEND_API_KEY"),
    });
  }

  const notesInvoiceId = String(notes.sitetrack_invoice_id || "");

  async function resolveInvoiceId(): Promise<string | null> {
    if (notesInvoiceId && notesInvoiceId !== "null" && notesInvoiceId !== "undefined") {
      return notesInvoiceId;
    }
    if (!paymentLinkId || paymentLinkId === "undefined" || paymentLinkId === "null") {
      return null;
    }
    const { data: found } = await supabase
      .from("invoices")
      .select("id")
      .eq("razorpay_payment_link_id", paymentLinkId)
      .maybeSingle();
    return found ? found.id : null;
  }

  const invoiceId = await resolveInvoiceId();
  if (!invoiceId) {
    // Notes-less payment.* events still carry the payment_link id — check
    // whether it belongs to a plan-upgrade link before acking.
    if (paymentLinkId && paymentLinkId !== "null" && paymentLinkId !== "undefined") {
      const { data: planPay } = await supabase
        .from("plan_payments")
        .select("id")
        .eq("link_id", paymentLinkId)
        .maybeSingle();
      if (planPay?.id) {
        return await handlePlanPayment({
          supabase,
          ppId: String(planPay.id),
          eventType,
          paymentLinkId,
          paymentEntity,
          resendKey: Deno.env.get("RESEND_API_KEY"),
        });
      }
    }
    console.warn("Razorpay webhook: no matching invoice", { eventType, paymentLinkId });
    return new Response(JSON.stringify({ ok: true, message: "no matching invoice" }), { status: 200 });
  }

  const newStatus = mapRazorpayStatus(eventType);
  if (newStatus === "pending") {
    // Unknown event — ack anyway so Razorpay stops retrying.
    return new Response(JSON.stringify({ ok: true, event: eventType, ignored: true }), { status: 200 });
  }

  const updates: Record<string, unknown> = {
    razorpay_status: newStatus,
    razorpay_payment_at: new Date().toISOString(),
  };
  if (paymentLinkId && paymentLinkId !== "null" && paymentLinkId !== "undefined") {
    updates.razorpay_payment_link_id = paymentLinkId;
  }

  // Mark paid_date when captured/paid.
  if (newStatus === "paid" || newStatus === "partial") {
    updates["paid_date"] = new Date().toISOString().split("T")[0];
  }

  // Settle real money: post a payments receipt row + close the invoice when
  // fully paid. (Previously only razorpay_status moved, so paid invoices
  // still read as outstanding everywhere.)
  if (newStatus === "paid" || newStatus === "partial") {
    const paymentId = String(paymentEntity?.id || "");
    const reference = paymentId || paymentLinkId || eventId || null;
    let alreadySettled = false;
    if (reference) {
      const { data: dup } = await supabase
        .from("payments")
        .select("id")
        .eq("reference", reference)
        .limit(1);
      alreadySettled = Array.isArray(dup) && dup.length > 0;
    }
    if (!alreadySettled) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("project_id, amount")
        .eq("id", invoiceId)
        .maybeSingle();
      // Razorpay amounts are paise; payments.amount is rupees (bigint).
      const eventPaise = Number(paymentEntity?.amount ?? NaN);
      const rupees = Number.isFinite(eventPaise) && eventPaise > 0
        ? Math.round(eventPaise / 100)
        : Math.round(Number((inv as { amount?: number } | null)?.amount ?? 0));
      if (inv && rupees > 0 && (inv as { project_id?: string }).project_id) {
        const { error: payErr } = await supabase.from("payments").insert({
          project_id: String((inv as { project_id?: string }).project_id ?? ""),
          target_type: "invoice",
          target_id: invoiceId,
          amount: rupees,
          method: "razorpay",
          reference,
          notes: newStatus === "paid" ? "Razorpay auto-settlement (full)" : "Razorpay auto-settlement (partial)",
        });
        if (payErr) console.error("Failed to post settlement payment:", payErr);
      }
    }
    // A fully-paid link covered the whole invoice amount → close it so
    // registers stop showing it outstanding. Partials keep their status.
    if (newStatus === "paid") {
      updates["status"] = "paid";
    }
  }

  const { error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId);

  if (error) {
    console.error("Failed to update invoice status:", error);
    return new Response(JSON.stringify({ ok: false, error: "update-failed" }), { status: 500 });
  }

  console.log(`Razorpay webhook: invoice ${invoiceId} → ${newStatus} (event: ${eventType})`);

  return new Response(JSON.stringify({ ok: true, invoice_id: invoiceId, status: newStatus }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ---------------------------------------------------------------------------
// Plan-upgrade settlement (mirrors cashfree-webhook's B2 handler).
// ---------------------------------------------------------------------------

async function handlePlanPayment(opts: {
  supabase: ReturnType<typeof createClient>;
  ppId: string;
  eventType: string;
  paymentLinkId: string;
  paymentEntity?: Record<string, unknown> | null;
  resendKey?: string;
}): Promise<Response> {
  const { supabase, ppId, eventType, paymentLinkId, paymentEntity, resendKey } = opts;

  const { data: pay, error: findErr } = await supabase
    .from("plan_payments")
    .select("id, org_id, plan, period, amount_paise, status")
    .eq("id", ppId)
    .maybeSingle();
  if (findErr) {
    console.error("Razorpay webhook: plan_payments lookup failed:", findErr);
    return new Response(JSON.stringify({ ok: false, error: "db-error" }), { status: 500 });
  }
  if (!pay) {
    console.warn("Razorpay webhook: plan payment row not found", { ppId });
    return new Response(JSON.stringify({ ok: true, message: "unknown plan payment" }), { status: 200 });
  }

  const currentStatus = String((pay as { status?: string }).status ?? "pending");
  const newStatus = mapRazorpayStatus(eventType);

  // Non-paid events: mark cancelled/expired/failed — only when still pending.
  // A settled row is never downgraded.
  if (newStatus !== "paid") {
    if (newStatus !== "pending" && currentStatus === "pending") {
      await supabase
        .from("plan_payments")
        .update({ status: newStatus })
        .eq("id", ppId)
        .catch((e: unknown) => console.warn("Razorpay webhook: plan_payments mark failed:", String(e)));
    }
    return new Response(JSON.stringify({ ok: true, event: eventType, ignored: true }), { status: 200 });
  }

  // Paid event on an already-settled row → idempotent ack (Razorpay retries).
  if (currentStatus === "paid") {
    console.log("Razorpay webhook: plan payment already settled", { ppId });
    return new Response(JSON.stringify({ ok: true, already_paid: true }), { status: 200 });
  }
  // Late PAID echo on a cancelled/expired row → never activate.
  if (currentStatus !== "pending") {
    console.warn("Razorpay webhook: PAID after terminal plan status — not activating", { ppId, currentStatus });
    return new Response(JSON.stringify({ ok: true, message: "ignored late paid echo" }), { status: 200 });
  }

  const orgId = String((pay as { org_id?: string }).org_id ?? "");
  const plan = String((pay as { plan?: string }).plan ?? "");
  const period = String((pay as { period?: string }).period ?? "monthly");
  const amountPaise = Number((pay as { amount_paise?: number }).amount_paise ?? 0);
  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + (period === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();
  const reference = paymentLinkId && paymentLinkId !== "undefined" && paymentLinkId !== "null"
    ? paymentLinkId
    : ppId;

  // 1. Settle the payment row first.
  const { error: settleErr } = await supabase
    .from("plan_payments")
    .update({ status: "paid", paid_at: now })
    .eq("id", ppId);
  if (settleErr) {
    console.error("Razorpay webhook: plan_payments settle failed:", settleErr);
    return new Response(JSON.stringify({ ok: false, error: "settle-failed" }), { status: 500 });
  }

  // 2. Activate the plan (service_role bypasses the 254 self-serve guard).
  const { error: planErr } = await supabase
    .from("organizations")
    .update({ plan, billing_period: period })
    .eq("id", orgId);
  if (planErr) {
    console.error("Razorpay webhook: organizations plan activation failed:", planErr);
    return new Response(JSON.stringify({ ok: false, error: "activation-failed" }), { status: 500 });
  }

  // 3. Subscription state mirrors the active plan.
  const { error: subErr } = await supabase
    .from("subscriptions")
    .upsert({
      org_id: orgId,
      provider: "razorpay",
      external_id: reference,
      plan,
      status: "active",
      current_period_start: now,
      current_period_end: periodEnd,
      trial_ends_at: null,
      updated_at: now,
    }, { onConflict: "org_id" });
  if (subErr) console.error("Razorpay webhook: subscriptions upsert failed:", subErr);

  // 4. Billing history — system of record for the charge.
  const chargedPaise = Number.isFinite(Number(paymentEntity?.amount)) ? Number(paymentEntity?.amount) : amountPaise;
  const gstPaise = chargedPaise > 0 ? chargedPaise - Math.round(chargedPaise / 1.18) : 0;
  const { error: histErr } = await supabase.from("billing_history").insert({
    org_id: orgId,
    provider: "razorpay",
    external_id: reference,
    amount: chargedPaise,
    currency: "INR",
    gst: gstPaise,
    status: "succeeded",
    paid_at: now,
    receipt_no: reference,
    payload: { plan, period, source: "plan_upgrade", event: eventType },
  });
  if (histErr) console.error("Razorpay webhook: billing_history insert failed:", histErr);

  // 5. Audit trail.
  await supabase
    .rpc("record_audit_v2", {
      p_action: "PAYMENT",
      p_resource: "subscription",
      p_resource_id: orgId,
      p_project_id: null,
      p_before: null,
      p_after: { plan, period, amount_paise: chargedPaise, reference },
      p_message: `Org subscription activated by payment: ${orgId} → ${plan} (${period})`,
    })
    .catch((e: unknown) => console.warn("Razorpay webhook: audit failed:", String(e)));

  // 6. Admin confirmation email when Resend is configured.
  if (resendKey) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    notifyOrgAdmins(
      supabase,
      orgId,
      String((org as { name?: string } | null)?.name || "workspace"),
      resendKey,
    ).catch((e: unknown) => console.warn("Razorpay webhook: activation email failed:", String(e)));
  }

  console.log("Razorpay webhook: org plan activated by payment", { orgId, plan, period, reference });
  return new Response(JSON.stringify({ ok: true, status: "paid", plan: true }), { status: 200 });
}

async function notifyOrgAdmins(
  supa: ReturnType<typeof createClient>,
  orgId: string,
  orgName: string,
  resendKey: string,
): Promise<void> {
  const { data: admins } = await supa
    .from("org_members")
    .select("profiles!inner(email, full_name)")
    .eq("org_id", orgId)
    .eq("role", "admin");

  const emails: string[] = [];
  for (const row of (admins || []) as Record<string, unknown>[]) {
    const p = row.profiles as Record<string, unknown> | undefined;
    if (p?.email && typeof p.email === "string") emails.push(p.email);
  }
  if (!emails.length) {
    console.warn("Razorpay webhook: notifyOrgAdmins no admin emails", { orgId });
    return;
  }

  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrackpro.in>";
  const { subject, html } = buildEmail(orgName);

  await Promise.all(
    emails.map(async (to) => {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from, to, subject, html }),
        });
        if (!r.ok) console.warn("Razorpay webhook: Resend rejected", { to, status: r.status });
      } catch (e) {
        console.warn("Razorpay webhook: Resend fetch failed", { to, err: String(e) });
      }
    }),
  );
}

function buildEmail(orgName: string): { subject: string; html: string } {
  return {
    subject: `Subscription activated — ${orgName}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#16a34a">Your plan is active</h2>
        <p><b>${esc(orgName)}</b> is now on its upgraded plan. Payments are handled by Razorpay.</p>
        <p>${esc(orgName)} is now live on its new subscription.</p>
        <p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
      </div>`,
  };
}

function esc(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}