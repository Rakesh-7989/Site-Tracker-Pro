/**
 * SiteTrack Pro — Cloudflare Workers Payment Service (Razorpay Rail)
 *
 * Implements Razorpay payment link minting and webhook signature verification
 * natively using Web Crypto.
 */

export const RAZORPAY_BASE = "https://api.razorpay.com/v1";

export function base64Credentials(keyId: string, secret: string): string {
  return btoa(`${keyId}:${secret}`);
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const expected = bytesToHex(sigBuf);

    if (expected.length !== signature.length) return false;

    // Constant-time comparison
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

export async function mintRazorpayPaymentLink({
  keyId,
  secret,
  amountInPaisa,
  currency = "INR",
  description,
  customer,
  notes,
}: {
  keyId: string;
  secret: string;
  amountInPaisa: number;
  currency?: string;
  description: string;
  customer?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
}): Promise<{ ok: boolean; id?: string; shortUrl?: string; error?: string }> {
  try {
    const authHeader = `Basic ${base64Credentials(keyId, secret)}`;
    const res = await fetch(`${RAZORPAY_BASE}/payment_links`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amountInPaisa),
        currency,
        description,
        customer,
        notes,
        reminder_enable: true,
      }),
    });

    const data = (await res.json()) as { id?: string; short_url?: string; error?: { description?: string } };
    if (!res.ok) {
      return { ok: false, error: data.error?.description || `HTTP ${res.status}` };
    }

    return {
      ok: true,
      id: data.id,
      shortUrl: data.short_url,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

