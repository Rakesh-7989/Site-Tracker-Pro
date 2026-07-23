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

import { PLAN_META } from "../data/seed";

const PROD_BASE = "https://api.cashfree.com/pg";
const SBOX_BASE = "https://sandbox.cashfree.com/pg";

interface CashfreeConfig {
  env?: string;
  app_id?: string;
  secret?: string;
}

interface OrgInfo {
  id: string;
  name?: string;
  contact_email?: string;
  contact_phone?: string;
}

type PlanKey = "basic" | "pro" | "business" | "custom";

interface SubscriptionPayload {
  subscription_id: string;
  plan_id: string;
  customer_details: {
    customer_name: string;
    customer_email: string;
    customer_phone: string;
  };
  subscription_meta: {
    return_url: string;
    notification_channel: string[];
  };
  subscription_expiry_time: string;
  subscription_first_charge_time: string;
  subscription_note: string;
}

interface SubscriptionRow {
  external_id?: string;
  plan?: string;
  status?: string;
  current_period_start?: string;
  current_period_end?: string;
  updated_at?: string;
  last_event?: string | null;
}

interface WebhookEventData {
  subscription_id?: string;
  plan_id?: string;
  subscription_status?: string;
  status?: string;
  current_cycle?: {
    cycle_start?: string;
    cycle_end?: string;
  };
}

interface WebhookEvent {
  type?: string;
  event_type?: string;
  data?: { subscription?: WebhookEventData };
  subscription?: WebhookEventData;
}

export function cashfreeBaseUrl(cfg?: CashfreeConfig): string {
  return cfg?.env === "production" ? PROD_BASE : SBOX_BASE;
}

export function isCashfreeConfigured(cfg?: CashfreeConfig): boolean {
  return !!(cfg?.app_id && cfg?.secret);
}

export function buildSubscriptionRequest(
  org: OrgInfo,
  plan: PlanKey,
  returnUrl?: string
): { subscription_id: string; payload: SubscriptionPayload } {
  if (!org?.id) throw new Error("buildSubscriptionRequest: org.id required");
  if (!PLAN_META[plan]) throw new Error(`buildSubscriptionRequest: unknown plan "${plan}"`);
  if (plan === "custom") throw new Error("Custom plans are negotiated manually — no Cashfree flow");
  const meta = PLAN_META[plan] as { label: string; price: number };
  const subscription_id = `st_${org.id.slice(0, 8)}_${plan}_${Date.now()}`;
  return {
    subscription_id,
    payload: {
      subscription_id,
      plan_id: `sitetrack_${plan}_monthly`,
      customer_details: {
        customer_name: org.name || "SiteTrack customer",
        customer_email: org.contact_email || "",
        customer_phone: org.contact_phone || "",
      },
      subscription_meta: {
        return_url: returnUrl || "",
        notification_channel: ["EMAIL", "SMS"],
      },
      subscription_expiry_time: isoNYearsFromNow(2),
      subscription_first_charge_time: isoTomorrow(),
      subscription_note: `SiteTrack ${meta.label} plan — ₹${meta.price.toLocaleString("en-IN")}/mo`,
    },
  };
}

export function buildCancellationRequest(
  externalId: string,
  reason?: string
): { subscription_id: string; cancellation_reason: string } {
  if (!externalId) throw new Error("buildCancellationRequest: externalId required");
  return {
    subscription_id: externalId,
    cancellation_reason: reason || "Cancelled by customer via SiteTrack",
  };
}

export function buildUpgradeOperations(
  currentExternalId: string,
  org: OrgInfo,
  newPlan: PlanKey,
  returnUrl?: string
): { op: "cancel" | "create"; body: SubscriptionPayload | { subscription_id: string; cancellation_reason: string }; subscription_id?: string }[] {
  const next = buildSubscriptionRequest(org, newPlan, returnUrl);
  return [
    { op: "cancel", body: buildCancellationRequest(currentExternalId, `Upgrading to ${newPlan}`) },
    { op: "create", body: next.payload, subscription_id: next.subscription_id },
  ];
}

export async function verifyWebhookSignature({
  rawBody, timestamp, signature, secret,
}: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
}): Promise<boolean> {
  if (!rawBody || !timestamp || !signature || !secret) return false;
  try {
    const enc = new TextEncoder();
    const keyData = enc.encode(secret);
    const msgData = enc.encode(`${timestamp}${rawBody}`);
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

export function verifyWebhookSignatureSync({
  rawBody, timestamp, signature, secret, hmacImpl,
}: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
  hmacImpl: (msg: string, secret: string) => string;
}): boolean {
  if (!rawBody || !timestamp || !signature || !secret || typeof hmacImpl !== "function") return false;
  const expected = hmacImpl(`${timestamp}${rawBody}`, secret);
  return constantTimeEqual(expected, signature);
}

export function applyWebhookEvent(
  currentRow: SubscriptionRow | null | undefined,
  event: WebhookEvent,
): SubscriptionRow {
  if (!event || typeof event !== "object") return currentRow ?? {};
  const type = event.type || event.event_type;
  const data = event.data?.subscription || event.subscription || {};
  const next: SubscriptionRow = { ...(currentRow || {}) };
  if (data.subscription_id) next.external_id = data.subscription_id;
  if (data.plan_id) {
    const m = /^sitetrack_(\w+)_monthly$/.exec(data.plan_id);
    if (m && PLAN_META[m[1] as keyof typeof PLAN_META]) next.plan = m[1];
  }
  next.status = mapCashfreeStatus(data.subscription_status || data.status);
  if (data.current_cycle?.cycle_start) next.current_period_start = data.current_cycle.cycle_start;
  if (data.current_cycle?.cycle_end) next.current_period_end = data.current_cycle.cycle_end;
  next.updated_at = new Date().toISOString();
  next.last_event = type || null;
  return next;
}

export function mapCashfreeStatus(cashfreeStatus?: string): string {
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

function isoTomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function isoNYearsFromNow(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString();
}

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(bin, "binary").toString("base64");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
