// Shared Cashfree helpers — mirror of src/lib/cashfree.js for Deno runtime.
//
// We keep the logic in TWO places (browser ESM + Deno) instead of trying to
// import the .js file because:
//   - Edge Functions don't bundle node_modules; bare-spec imports must be URL
//   - The browser version uses Vite's env; Deno uses Deno.env.get
//
// The two implementations MUST stay in sync. The test suite
// tests/cashfree.test.js exercises the browser file; the Edge Function deploy
// gate exercises this file via `supabase functions test cashfree-webhook`.

export const PLAN_META = {
  basic:    { label: "Basic",    price: 999 },
  pro:      { label: "Pro",      price: 2999 },
  business: { label: "Business", price: 7999 },
  custom:   { label: "Custom",   price: 0 },
};

const PROD_BASE = "https://api.cashfree.com/pg";
const SBOX_BASE = "https://sandbox.cashfree.com/pg";

export function cashfreeBaseUrl(cfg: { env?: string }): string {
  return cfg?.env === "production" ? PROD_BASE : SBOX_BASE;
}

export function isCashfreeConfigured(cfg: { app_id?: string; secret?: string } | null): boolean {
  return !!(cfg?.app_id && cfg?.secret);
}

export interface SubscriptionRequest {
  subscription_id: string;
  payload: Record<string, unknown>;
}

export function buildSubscriptionRequest(
  org: { id: string; name?: string; contact_email?: string; contact_phone?: string },
  plan: keyof typeof PLAN_META,
  returnUrl: string,
): SubscriptionRequest {
  if (!org?.id) throw new Error("buildSubscriptionRequest: org.id required");
  if (!PLAN_META[plan]) throw new Error(`unknown plan "${plan}"`);
  if (plan === "custom") throw new Error("Custom plans are negotiated manually");
  const meta = PLAN_META[plan];
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
      subscription_note: `SiteTrack ${meta.label} plan — INR ${meta.price}/mo`,
    },
  };
}

/**
 * Verify Cashfree webhook signature.
 * Cashfree signs `${timestamp}${rawBody}` with the WEBHOOK secret (distinct
 * from API secret). Returns true when the computed HMAC SHA-256 matches.
 *
 * Uses Web Crypto — available in both browsers and Deno runtime.
 */
export async function verifyWebhookSignature({
  rawBody,
  timestamp,
  signature,
  secret,
}: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
}): Promise<boolean> {
  if (!rawBody || !timestamp || !signature || !secret) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}${rawBody}`));
    const expected = base64FromArrayBuffer(sigBuf);
    return constantTimeEqual(expected, signature);
  } catch {
    return false;
  }
}

export function mapCashfreeStatus(s: string | undefined): string {
  switch ((s || "").toUpperCase()) {
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

export function applyWebhookEvent(
  current: Record<string, unknown> | null,
  event: { type?: string; event_type?: string; data?: { subscription?: Record<string, unknown> } } | null,
): Record<string, unknown> {
  if (!event || typeof event !== "object") return current || {};
  const type = event.type || event.event_type;
  const data = (event.data?.subscription || {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...(current || {}) };
  if (data.subscription_id) next.external_id = data.subscription_id;
  if (typeof data.plan_id === "string") {
    const m = /^sitetrack_(\w+)_monthly$/.exec(data.plan_id);
    if (m && PLAN_META[m[1] as keyof typeof PLAN_META]) next.plan = m[1];
  }
  next.status = mapCashfreeStatus(data.subscription_status as string || data.status as string);
  const cycle = data.current_cycle as Record<string, unknown> | undefined;
  if (cycle?.cycle_start) next.current_period_start = cycle.cycle_start;
  if (cycle?.cycle_end) next.current_period_end = cycle.cycle_end;
  next.updated_at = new Date().toISOString();
  next.last_event = type || null;
  return next;
}

// ── helpers ───────────────────────────────────────────────────────────────
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
  return btoa(bin);
}
function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
