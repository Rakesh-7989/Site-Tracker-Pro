// Shared Resend webhook helpers — Svix-compatible signature verification +
// event parsing. Resend (https://resend.com) signs every webhook POST with the
// Svix scheme: the `whsec_...` signing secret (base64), headers `svix-id`,
// `svix-timestamp`, `svix-signature` (`v1,<base64>` — space/comma separated).
//
// The two implementations stay in sync pattern: this pure module is imported by
// the resend-webhook Edge Function AND by vitest (tests/efResendWebhook.test.ts).

export interface ResendWebhookHeaders {
  msgId: string;
  timestamp: string;
  signature: string; // raw svix-signature header value
}

export interface ResendEvent {
  event: string;
  messageId?: string;
  toEmail?: string;
  subject?: string;
  tags?: { name: string; value: string }[];
  raw: Record<string, unknown>;
}

export const RESEND_WEBHOOK_TOLERANCE_SEC = 300;

/** Base64-decode a Svix `whsec_...` signing secret → the raw HMAC key. */
export function decodeResendSecret(secret: string): Uint8Array<ArrayBuffer> {
  let b64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  // Resend's create-webhook response returns the signing secret UNPADDED (e.g.
  // 31 base64 chars). atob() throws on non-multiple-of-4 input, which would make
  // signature verification permanently fail against those secrets — pad first.
  const pad = b64.length % 4;
  if (pad !== 0) b64 = b64.padEnd(b64.length + (4 - pad), "=");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a Svix-signed webhook. Returns true when ANY `v1,<base64>` signature
 * matches the HMAC-SHA256 of `${msgId}.${timestamp}.${rawBody}` keyed by the
 * base64-decoded secret, AND the timestamp is within the tolerance window.
 */
export async function verifyResendWebhookSignature(
  headers: ResendWebhookHeaders,
  rawBody: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!headers.msgId || !headers.timestamp || !headers.signature || !secret) return false;

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSec - ts) > RESEND_WEBHOOK_TOLERANCE_SEC) return false;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      decodeResendSecret(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const content = `${headers.msgId}.${headers.timestamp}.${rawBody}`;
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(content));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    for (const part of headers.signature.trim().split(/\s+/)) {
      const [version, sig] = part.split(",", 2);
      if (version === "v1" && sig && constantTimeEqual(expected, sig)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse a Resend webhook payload into a normalized event. Resend sends
 * `{ event, created_at, data: { id, email_id, created_at, to, from, subject,
 * tags, ... } }` — `data.id` is the Resend message id.
 */
export function parseResendEvent(payload: string | Record<string, unknown>): ResendEvent | null {
  let body: Record<string, unknown>;
  try {
    body = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    return null;
  }
  const event = typeof body.event === "string" ? body.event : "";
  if (!event) return null;
  const data = (body.data ?? {}) as Record<string, unknown>;
  const to = data.to as string | string[] | undefined;
  return {
    event,
    messageId: typeof data.id === "string" ? data.id : undefined,
    toEmail: Array.isArray(to) ? to[0] : typeof to === "string" ? to : undefined,
    subject: typeof data.subject === "string" ? data.subject : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as { name: string; value: string }[]) : undefined,
    raw: body,
  };
}

/** Map a Resend event name to a compact storage value. */
export function normalizeResendEventName(event: string): string {
  return event.replace(/^email\./, "").toLowerCase();
}