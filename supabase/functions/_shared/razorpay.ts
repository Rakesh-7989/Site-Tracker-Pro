// Shared Razorpay helpers — mirror of _shared/cashfree.ts for the Deno runtime.
//
// The Payment Links + Webhook EFs share three pieces that must stay in sync:
// the API base, the Basic auth header, and the HMAC-SHA256 webhook signature
// verification. Keeping them here (instead of duplicated in each EF) lets
// tests/efRazorpay.test.ts lock the literals in one place.

export const RAZORPAY_BASE = "https://api.razorpay.com/v1";

// Razorpay authenticates every API call with HTTP Basic over
// base64(${keyId}:${secret}).
export function base64Credentials(keyId: string, secret: string): string {
  return btoa(`${keyId}:${secret}`);
}

// Hex-encode bytes — Razorpay mints signatures as hex digests.
export function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the raw webhook body with HMAC-SHA256 and sends the hex
 * digest in the `X-Razorpay-Signature` header. The secret is
 * `RAZORPAY_WEBHOOK_SECRET` with a fallback to the API `RAZORPAY_KEY_SECRET`.
 *
 * Uses Web Crypto — available in both browsers and the Deno runtime (same
 * approach as `verifyWebhookSignature` in _shared/cashfree.ts).
 */
export async function verifyRazorpaySignature({
  rawBody,
  signature,
  secret,
}: {
  rawBody: string;
  signature: string;
  secret: string;
}): Promise<boolean> {
  if (!rawBody || !signature || !secret) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const expected = bytesToHex(sigBuf);
    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

// Map Razorpay webhook event types to invoice razorpay_status values.
// payment_link.* events cover the Payment Links flow; payment.* events cover
// direct payments against the same invoice.
export function mapRazorpayStatus(eventType: string): string {
  const statusMap: Record<string, string> = {
    "payment.captured": "paid",
    "payment.failed": "failed",
    "payment.expired": "expired",
    "payment.refunded": "cancelled",
    "payment.partially_refunded": "partial",
    "payment_link.paid": "paid",
    "payment_link.cancelled": "cancelled",
    "payment_link.expired": "expired",
    "payment_link.partially_paid": "partial",
  };
  return statusMap[eventType] || "pending";
}