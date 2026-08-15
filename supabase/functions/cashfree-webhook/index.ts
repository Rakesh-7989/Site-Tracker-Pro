// Edge Function: cashfree-webhook
//
// Cashfree POSTs two kinds of events here:
//   (A) SUBSCRIPTION lifecycle events (mandate signed, payment succeeded,
//       payment failed, subscription cancelled) → mapped onto the
//       `subscriptions` row via applyWebhookEvent().
//   (B) PAYMENT LINK events (type "PAYMENT_LINK_EVENT") — the one-time signup
//       payment created by cashfree-checkout. Reconciled against the
//       `signup_requests` row (payment_ref = Cashfree link_id, or the
//       link_meta.signup_request_id echoed back) and marked paid when the link
//       settles PAID. billing_history is seeded LATER at org creation
//       (review_signup_request) because billing_history.org_id is NOT NULL and
//       no org exists at payment time.
//
// For every OTHER event: return 200 (ack) so Cashfree stops retrying — never
// 4xx a well-formed, signature-valid event we simply don't act on.
//
// Deploy:
//   supabase functions deploy cashfree-webhook --no-verify-jwt
//   (no-verify-jwt because Cashfree doesn't send a Supabase JWT)
//
// Then in the Cashfree dashboard, set the webhook URL to:
//   https://<proj>.supabase.co/functions/v1/cashfree-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyWebhookSignature,
  applyWebhookEvent,
} from "../_shared/cashfree.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return text("POST only", 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const WEBHOOK_SECRET = Deno.env.get("CASHFREE_WEBHOOK_SECRET");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !WEBHOOK_SECRET) {
    return text("Edge env not configured", 500);
  }
  if (!RESEND_API_KEY) {
    console.warn("cashfree-webhook: RESEND_API_KEY not set — email notifications disabled");
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";

  // Verify signature first — drop anything that fails (replay-attack resistant
  // because timestamp+body are signed together).
  const ok = await verifyWebhookSignature({ rawBody, timestamp, signature, secret: WEBHOOK_SECRET });
  if (!ok) {
    console.warn("Cashfree webhook signature invalid", { timestamp, sigPrefix: signature.slice(0, 8) });
    return text("Invalid signature", 401);
  }

  let event: {
    type?: string;
    event_type?: string;
    data?: {
      subscription?: { subscription_id?: string };
      // Payment-link event fields (type "PAYMENT_LINK_EVENT")
      link_id?: string;
      link_status?: string;
      link_amount_paid?: string | number;
      link_meta?: { signup_request_id?: string };
      order?: { order_id?: string; transaction_status?: string; order_amount?: string | number };
    };
  };
  try { event = JSON.parse(rawBody); }
  catch { return text("Invalid JSON", 400); }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  const data = event.data || {};
  const linkId = data.link_id;
  // Cashfree payment-link webhooks use type "PAYMENT_LINK_EVENT" with
  // data.link_id / data.link_status — distinct from subscription events.
  const isPaymentLinkEvent =
    Boolean(linkId)
    || event.type === "PAYMENT_LINK_EVENT"
    || Boolean(data.link_status);

  if (isPaymentLinkEvent) {
    return handlePaymentLinkEvent(supa, data, { resendKey: RESEND_API_KEY });
  }

  const subId = data.subscription?.subscription_id;
  if (!subId) return text("No subscription_id in event", 400);

  // Load current row (may not exist yet if this is the first event)
  const { data: current, error: loadErr } = await supa
    .from("subscriptions")
    .select("*")
    .eq("external_id", subId)
    .maybeSingle();
  if (loadErr) {
    console.error("subscriptions fetch failed:", loadErr);
    return text("db-error", 500);
  }

  const next = applyWebhookEvent(current, event);

  // We MUST preserve org_id from the existing row — Cashfree doesn't echo it.
  if (current?.org_id) next.org_id = current.org_id;
  if (!next.org_id) {
    // Orphan event — log and ack so Cashfree stops retrying.
    console.warn("Cashfree webhook arrived with no matching org row", { subId });
    return text("ok (orphan)", 200);
  }

  const { error: upsertErr } = await supa.from("subscriptions").upsert(next, { onConflict: "external_id" });
  if (upsertErr) {
    console.error("subscriptions upsert failed:", upsertErr);
    return text("upsert failed", 500);
  }

  // Audit log — use the SECURITY DEFINER RPC so it goes through the
  // canonical write path (audit_log_v2 is append-only).
  await supa.rpc("record_audit_v2", {
    p_action: next.status === "active" ? "PAYMENT" :
              next.status === "cancelled" ? "DELETE" : "UPDATE",
    p_resource: "subscription",
    p_resource_id: String(next.org_id),
    p_project_id: null,
    p_before: current ? { status: current.status, plan: current.plan } : null,
    p_after: { status: next.status, plan: next.plan, last_event: next.last_event },
    p_message: `Cashfree event ${next.last_event}: ${current?.status || "(new)"} → ${next.status}`,
  }).catch((e) => console.warn("audit failed:", e));

  // ── Email notifications on status transitions ───────────────────────────
  // Fire-and-forget: never block the webhook response. Only send when status
  // actually changes (skip transient "pending") and RESEND_API_KEY is set.
  const prevStatus = current?.status as string | undefined;
  const newStatus = next.status as string;

  if (prevStatus && prevStatus !== newStatus && newStatus !== "pending" && RESEND_API_KEY) {
    const { data: org } = await supa
      .from("organizations")
      .select("name")
      .eq("id", next.org_id)
      .single();
    notifyOrgAdmins(supa, next.org_id as string, org?.name || "Unknown", newStatus, prevStatus, RESEND_API_KEY)
      .catch((e) => console.warn("email notification failed:", e));
  }

  return text("ok", 200);
});

// ── Helpers ────────────────────────────────────────────────────────────────

// Handle a Cashfree PAYMENT_LINK_EVENT (one-time signup payment from
// cashfree-checkout). Reconcile against signup_requests and, on PAID, mark the
// row paid + record the gateway charge. billing_history is NOT written here —
// it needs the org that review_signup_request creates on approval (E2).
async function handlePaymentLinkEvent(
  supa: ReturnType<typeof createClient>,
  data: {
    link_id?: string;
    link_status?: string;
    link_amount_paid?: string | number;
    link_meta?: { signup_request_id?: string };
    order?: { order_id?: string; transaction_status?: string; order_amount?: string | number };
  },
  opts: { resendKey?: string },
): Promise<Response> {
  const linkId = String(data.link_id ?? "");
  // The checkout echoes signup_request_id in link_meta; fall back to matching
  // the stashed payment_ref (= Cashfree link_id) stored by cashfree-checkout.
  const metaReqId = data.link_meta?.signup_request_id ? String(data.link_meta.signup_request_id) : null;

  let query = supa.from("signup_requests").select("id, payment_status, payment_ref, contact_name, email, firm_name").limit(1);
  if (metaReqId) query = query.eq("id", metaReqId);
  else if (linkId) query = query.eq("payment_ref", linkId);
  else return text("ok (no link id)", 200);

  const { data: rows, error: findErr } = await query;
  if (findErr) {
    console.error("signup_requests lookup failed:", findErr);
    return text("db-error", 500);
  }
  const row = Array.isArray(rows) && rows.length ? (rows[0] as Record<string, unknown>) : null;

  const linkStatus = String(data.link_status ?? "").toUpperCase();
  const orderStatus = String((data.order as Record<string, unknown> | undefined)?.transaction_status ?? "").toUpperCase();
  const paid = linkStatus === "PAID" || orderStatus === "SUCCESS";
  const cancelledOrExpired = linkStatus === "EXPIRED" || linkStatus === "CANCELLED";

  if (!row) {
    // Unknown link — ack so Cashfree stops retrying (no signup to update).
    console.warn("cashfree-webhook: payment-link event for unknown signup", { linkId, linkStatus, metaReqId });
    return text("ok (orphan payment link)", 200);
  }

  const requestId = String(row.id);
  const alreadyPaid = String(row.payment_status ?? "unpaid") === "paid";

  if (!paid) {
    // Failed/expired/cancelled/partial — leave unpaid. Ack (no retry storm).
    if (alreadyPaid) {
      // Already paid from an earlier event; a late non-PAID echo must not flip it.
      console.log("cashfree-webhook: late non-PAID echo ignored for paid signup", { requestId, linkStatus });
    } else {
      console.log("cashfree-webhook: payment link not paid", { requestId, linkId, linkStatus, orderStatus });
    }
    return text("ok", 200);
  }

  if (alreadyPaid) {
    // Idempotent — Cashfree may re-deliver a PAID event.
    return text("ok (already paid)", 200);
  }

  // Gateway charge in paise: order.order_amount is paise; link_amount_paid is
  // INR (minor-unit? no — currency units), so convert when present.
  const orderAmount = Number((data.order as Record<string, unknown> | undefined)?.order_amount);
  const linkAmountPaid = Number(data.link_amount_paid);
  const amountPaise = Number.isFinite(orderAmount) && orderAmount > 0
    ? Math.round(orderAmount)
    : Number.isFinite(linkAmountPaid) && linkAmountPaid > 0
      ? Math.round(linkAmountPaid * 100)
      : null;

  const patch: Record<string, unknown> = { payment_status: "paid", paid_at: new Date().toISOString() };
  if (amountPaise != null && amountPaise > 0) patch.paid_amount_paise = amountPaise;
  // Keep the stashed payment_ref (link id) as the gateway reference.
  if (linkId) patch.payment_ref = linkId;

  const { error: updErr } = await supa
    .from("signup_requests")
    .update(patch)
    .eq("id", requestId);
  if (updErr) {
    console.error("signup_requests paid-update failed:", updErr);
    return text("update failed", 500);
  }

  console.log("cashfree-webhook: signup marked paid by gateway", { requestId, linkId, amountPaise });
  notifySignupPaid(supa, row, { resendKey: opts.resendKey }).catch((e) =>
    console.warn("paid-email notification failed:", e),
  );

  return text("ok", 200);
}

// Fire-and-forget confirmation email when RESEND is configured.
async function notifySignupPaid(
  supa: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  opts: { resendKey?: string },
): Promise<void> {
  const key = opts.resendKey;
  if (!key) return;
  const to = String(row.email ?? "");
  if (!to) return;
  const firm = String(row.firm_name ?? "Your firm");
  const contact = String(row.contact_name ?? "");

  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2 style="color:#16a34a">Payment received</h2>
      <p>Hi ${esc(contact || "there")},</p>
      <p>We received your payment for the <b>${esc(firm)}</b> SiteTrack Pro workspace.</p>
      <p>Our team will provision your account shortly and email your sign-in details.</p>
      <p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
    </div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: `Payment received — ${firm}`, html }),
    });
    if (!r.ok) console.warn("notifySignupPaid: Resend rejected", { to, status: r.status });
  } catch (e) {
    console.warn("notifySignupPaid: fetch failed", { to, err: String(e) });
  }
}

async function notifyOrgAdmins(
  supa: ReturnType<typeof createClient>,
  orgId: string,
  orgName: string,
  newStatus: string,
  prevStatus: string | undefined,
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
    console.warn("notifyOrgAdmins: no admin emails", { orgId });
    return;
  }

  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const { subject, html } = buildEmail(orgName, newStatus, prevStatus);

  await Promise.all(emails.map(async (to) => {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!r.ok) console.warn("notifyOrgAdmins: Resend rejected", { to, status: r.status });
    } catch (e) {
      console.warn("notifyOrgAdmins: fetch failed", { to, err: String(e) });
    }
  }));
}

function buildEmail(
  orgName: string, newStatus: string, prevStatus: string | undefined,
): { subject: string; html: string } {
  const org = esc(orgName);
  switch (newStatus) {
    case "active":
      return {
        subject: `Subscription activated — ${orgName}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#16a34a">Subscription Activated</h2>
<p>Your <strong>${org}</strong> subscription is now <strong>active</strong>.</p>
<p>All features are available. Visit the billing page to manage your plan.</p>
<p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
</div>`,
      };
    case "past_due":
      return {
        subject: `Payment failed — ${orgName}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#dc2626">Payment Failed</h2>
<p>We were unable to process payment for <strong>${org}</strong>.</p>
<p>Your subscription will be paused if the issue is not resolved within 3 days.</p>
<p>Please update your payment method or contact support.</p>
<p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
</div>`,
      };
    case "cancelled":
      return {
        subject: `Subscription cancelled — ${orgName}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#dc2626">Subscription Cancelled</h2>
<p>The <strong>${org}</strong> subscription has been cancelled.</p>
<p>You can reactivate at any time from the billing page.</p>
<p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
</div>`,
      };
    case "paused":
      return {
        subject: `Subscription paused — ${orgName}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#f59e0b">Subscription Paused</h2>
<p>The <strong>${org}</strong> subscription has been paused by the platform administrator.</p>
<p>Billing will resume when the subscription is reactivated.</p>
<p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
</div>`,
      };
    default:
      return {
        subject: `Subscription update — ${orgName}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2>Subscription Updated</h2>
<p>The <strong>${org}</strong> subscription status changed from <strong>${prevStatus || "(none)"}</strong> to <strong>${newStatus}</strong>.</p>
<p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
</div>`,
      };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}
