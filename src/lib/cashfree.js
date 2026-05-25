// SiteTrack Pro — Cashfree Subscriptions integration (Session 15 part 2).
//
// Cashfree is India's most mature subscription billing rail with native UPI
// AutoPay support — critical because the majority of Indian builders pay
// monthly SaaS via UPI, not credit cards. Razorpay handles one-off invoice
// payments well; Cashfree handles the recurring SaaS subscription itself.
//
// This module is PURE — no network calls, no React. It assembles request
// bodies + validates webhook payloads + maps Cashfree status → our internal
// subscription state. The actual HTTP work happens server-side via a
// Supabase Edge Function (see docs/CASHFREE_ONBOARDING.md).
//
// Architecture
// ────────────
//   1. Org admin clicks "Upgrade plan" in OrgBillingView.
//   2. Client → POST our Edge Function with { org_id, target_plan }.
//   3. Edge Function → POST Cashfree /pg/subscriptions with the payload built
//      by `buildSubscriptionRequest()` here.
//   4. Cashfree returns { subscription_id, subscription_session_id }.
//   5. We open `cashfree.session(subscription_session_id)` in the browser; the
//      org admin enters their UPI ID + approves the mandate inside the
//      Cashfree-hosted UI.
//   6. Cashfree fires webhooks for each lifecycle event; the Edge Function
//      validates the signature via `verifyWebhookSignature()` here, then
//      writes to the `subscriptions` table (service_role bypasses RLS).
//
// Status mapping
// ──────────────
//   Cashfree              →  SiteTrack
//   ACTIVE                →  active
//   AUTHORIZED            →  pending     (UPI mandate signed, awaiting first debit)
//   INITIALIZED           →  pending
//   ON_HOLD               →  past_due
//   PAUSED                →  past_due
//   CANCELLED             →  cancelled
//   COMPLETED             →  cancelled   (term ended, not auto-renewed)
//   BANK_APPROVAL_PENDING →  pending

import { PLAN_META } from "../data/seed.js";

const PROD_BASE = "https://api.cashfree.com/pg";
const SBOX_BASE = "https://sandbox.cashfree.com/pg";

/** Choose the right base URL — pluggable via cfg.env="production" or "sandbox". */
export function cashfreeBaseUrl(cfg) {
  return cfg?.env === "production" ? PROD_BASE : SBOX_BASE;
}

/** True if Cashfree creds are present (app_id + secret minimum). */
export function isCashfreeConfigured(cfg) {
  return !!(cfg?.app_id && cfg?.secret);
}

/**
 * Build the request body for POST {base}/pg/subscriptions.
 * Cashfree API ref: https://docs.cashfree.com/reference/sub-createsubscription
 *
 * Args:
 *   org: { id, name, contact_email }
 *   plan: "basic" | "pro" | "business" | "custom"
 *   returnUrl: where the user returns after consent
 *
 * Returns: { subscription_id, payload }
 *   - subscription_id is what we'll send to Cashfree (idempotency key).
 *   - payload is the JSON body the Edge Function should POST.
 */
export function buildSubscriptionRequest(org, plan, returnUrl) {
  if (!org?.id) throw new Error("buildSubscriptionRequest: org.id required");
  if (!PLAN_META[plan]) throw new Error(`buildSubscriptionRequest: unknown plan "${plan}"`);
  if (plan === "custom") throw new Error("Custom plans are negotiated manually — no Cashfree flow");
  const meta = PLAN_META[plan];
  // subscription_id must be unique per attempt. Org + plan + timestamp is safe.
  const subscription_id = `st_${org.id.slice(0, 8)}_${plan}_${Date.now()}`;
  return {
    subscription_id,
    payload: {
      subscription_id,
      plan_id: `sitetrack_${plan}_monthly`, // pre-created in Cashfree dashboard
      customer_details: {
        customer_name: org.name || "SiteTrack customer",
        customer_email: org.contact_email || "",
        customer_phone: org.contact_phone || "",
      },
      subscription_meta: {
        return_url: returnUrl || "",
        notification_channel: ["EMAIL", "SMS"],
      },
      subscription_expiry_time: isoNYearsFromNow(2), // 2-year max binding
      subscription_first_charge_time: isoTomorrow(), // give the customer 24h to cancel
      subscription_note: `SiteTrack ${meta.label} plan — ₹${meta.price.toLocaleString("en-IN")}/mo`,
    },
  };
}

/** Build the cancellation request body for DELETE {base}/pg/subscriptions/{sub_id}. */
export function buildCancellationRequest(externalId, reason) {
  if (!externalId) throw new Error("buildCancellationRequest: externalId required");
  return {
    subscription_id: externalId,
    cancellation_reason: reason || "Cancelled by customer via SiteTrack",
  };
}

/**
 * Build the upgrade/downgrade request — Cashfree treats this as cancelling
 * the existing subscription and creating a new one with proration.
 *
 * Returns an array of operations the Edge Function should run in sequence.
 */
export function buildUpgradeOperations(currentExternalId, org, newPlan, returnUrl) {
  const next = buildSubscriptionRequest(org, newPlan, returnUrl);
  return [
    { op: "cancel", body: buildCancellationRequest(currentExternalId, `Upgrading to ${newPlan}`) },
    { op: "create", body: next.payload, subscription_id: next.subscription_id },
  ];
}

/**
 * Verify the HMAC SHA-256 signature on a Cashfree webhook.
 * Cashfree sends headers:
 *   x-webhook-signature       — base64-encoded HMAC SHA-256
 *   x-webhook-timestamp       — ms epoch
 * Signed payload = `${timestamp}${rawBody}`. Secret is the webhook secret
 * (NOT the API secret — distinct field in the dashboard).
 *
 * Returns true when the computed signature matches the header.
 *
 * NOTE: Uses Web Crypto API (available in browsers AND in Supabase Edge
 * Function Deno runtime), so the same code runs in both places.
 */
export async function verifyWebhookSignature({ rawBody, timestamp, signature, secret }) {
  if (!rawBody || !timestamp || !signature || !secret) return false;
  try {
    const enc = new TextEncoder();
    const keyData = enc.encode(secret);
    const msgData = enc.encode(`${timestamp}${rawBody}`);
    // Browsers + Deno both expose crypto.subtle.importKey.
    const key = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, msgData);
    const expected = base64FromArrayBuffer(sigBuf);
    return constantTimeEqual(expected, signature);
  } catch {
    return false;
  }
}

/** Synchronous fallback for environments without crypto.subtle (tests). */
export function verifyWebhookSignatureSync({ rawBody, timestamp, signature, secret, hmacImpl }) {
  if (!rawBody || !timestamp || !signature || !secret || typeof hmacImpl !== "function") return false;
  const expected = hmacImpl(`${timestamp}${rawBody}`, secret);
  return constantTimeEqual(expected, signature);
}

/** Map a Cashfree webhook payload → our internal subscription row patch. */
export function applyWebhookEvent(currentRow, event) {
  if (!event || typeof event !== "object") return currentRow;
  const type = event.type || event.event_type;
  const data = event.data?.subscription || event.subscription || {};
  const next = { ...(currentRow || {}) };
  if (data.subscription_id) next.external_id = data.subscription_id;
  if (data.plan_id) {
    // Strip our prefix to get the bare plan name.
    const m = /^sitetrack_(\w+)_monthly$/.exec(data.plan_id);
    if (m && PLAN_META[m[1]]) next.plan = m[1];
  }
  next.status = mapCashfreeStatus(data.subscription_status || data.status);
  if (data.current_cycle?.cycle_start) next.current_period_start = data.current_cycle.cycle_start;
  if (data.current_cycle?.cycle_end) next.current_period_end = data.current_cycle.cycle_end;
  next.updated_at = new Date().toISOString();
  next.last_event = type || null;
  return next;
}

/** Cashfree status → internal status. */
export function mapCashfreeStatus(cashfreeStatus) {
  switch ((cashfreeStatus || "").toUpperCase()) {
    case "ACTIVE": return "active";
    case "AUTHORIZED":
    case "INITIALIZED":
    case "BANK_APPROVAL_PENDING": return "pending";
    case "ON_HOLD":
    case "PAUSED": return "past_due";
    case "CANCELLED":
    case "COMPLETED": return "cancelled";
    default: return "pending";
  }
}

// ── Local helpers ─────────────────────────────────────────────────────────

function isoTomorrow() {
  return new Date(Date.now() + 86_400_000).toISOString();
}
function isoNYearsFromNow(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString();
}
function base64FromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  // btoa exists in browsers + Deno
  return typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(bin, "binary").toString("base64");
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
