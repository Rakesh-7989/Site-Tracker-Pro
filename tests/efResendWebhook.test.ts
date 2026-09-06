// SiteTrack Pro — resend-webhook EF + shared verification module.
//
// Resend signs webhook POSTs with the Svix scheme (RESEND_WEBHOOK_SECRET, a
// base64 `whsec_...` key; headers svix-id / svix-timestamp / svix-signature).
// This file locks the shared helpers (parse/normalize/verify) so a future
// change can't silently accept forged webhooks, and asserts the EF uses them
// and never enables an insecure fallback.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeResendSecret,
  normalizeResendEventName,
  parseResendEvent,
  verifyResendWebhookSignature,
} from "../supabase/functions/_shared/resendWebhook";

const SECRET = "whsec_+RZwnfV2r4PsPo/B0o+xhZcTh/SKtG42";

async function hmacSign(key: Uint8Array<ArrayBuffer>, content: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", k, enc.encode(content));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

describe("resendWebhook shared helpers", () => {
  it("decodeResendSecret strips whsec_ prefix and base64-decodes", () => {
    const key = decodeResendSecret(SECRET);
    expect(key.length).toBeGreaterThan(0);
    // round-trips: re-encoding gives the same base64 (Svix secret without prefix)
    const b64 = btoa(String.fromCharCode(...key));
    expect(b64).toBe(SECRET.replace(/^whsec_/, ""));
  });

  it("decodeResendSecret handles Resend's UNPADDED signing secret (create-webhook response shape)", async () => {
    // Resend returns the whsec_ value UNPADDED (e.g. 31 base64 chars → len % 4 === 3).
    // atob() would throw on that; the decoder must pad to a multiple of 4 first.
    const raw = new Uint8Array(Array.from({ length: 23 }, (_, i) => i));
    const b64 = btoa(String.fromCharCode(...raw));
    expect(b64.endsWith("=")).toBe(true); // padded form ends with one '='
    const unpaddedSecret = `whsec_${b64.slice(0, -1)}`; // drop the pad → 31 base64 chars
    expect(unpaddedSecret.length).toBe(37); // "whsec_" (6) + 31 chars — Resend's real shape
    expect(unpaddedSecret.slice("whsec_".length).length % 4).toBe(3); // unpadded base64

    const key = decodeResendSecret(unpaddedSecret);
    expect(Array.from(key)).toEqual(Array.from(raw));

    // AND the end-to-end verify path must succeed with the unpadded secret string.
    const msgId = "msg_padded_ok";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event: "email.delivered", data: { id: "re_pad", to: ["a@b.c"] } });
    const signature = await hmacSign(key, `${msgId}.${timestamp}.${body}`);
    const ok = await verifyResendWebhookSignature(
      { msgId, timestamp, signature: `v1,${signature}` },
      body,
      unpaddedSecret,
    );
    expect(ok).toBe(true);
  });

  it("verifyResendWebhookSignature accepts a genuine Svix-signed payload", async () => {
    const msgId = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event: "email.delivered", data: { id: "re_abc", to: ["a@b.c"] } });
    const content = `${msgId}.${timestamp}.${body}`;
    const signature = await hmacSign(decodeResendSecret(SECRET), content);

    const ok = await verifyResendWebhookSignature(
      { msgId, timestamp, signature: `v1,${signature}` },
      body,
      SECRET,
    );
    expect(ok).toBe(true);
  });

  it("rejects a wrong signature (forged webhook)", async () => {
    const msgId = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event: "email.bounced", data: {} });
    const content = `${msgId}.${timestamp}.${body}`;
    const goodSig = await hmacSign(decodeResendSecret(SECRET), content);
    const badSig = goodSig.replace(/^.{4}/, "AAAA");

    const ok = await verifyResendWebhookSignature(
      { msgId, timestamp, signature: `v1,${badSig}` },
      body,
      SECRET,
    );
    expect(ok).toBe(false);
  });

  it("rejects a stale timestamp (replay protection)", async () => {
    const body = JSON.stringify({ event: "email.delivered", data: {} });
    const content = `msg_stale.1500000000.${body}`;
    const signature = await hmacSign(decodeResendSecret(SECRET), content);
    const ok = await verifyResendWebhookSignature(
      { msgId: "msg_stale", timestamp: "1500000000", signature: `v1,${signature}` },
      body,
      SECRET,
      Math.floor(Date.now() / 1000),
    );
    expect(ok).toBe(false);
  });

  it("rejects missing headers / empty secret", async () => {
    const body = "{}";
    expect(await verifyResendWebhookSignature({ msgId: "", timestamp: "1", signature: "v1,x" }, body, SECRET)).toBe(false);
    expect(await verifyResendWebhookSignature({ msgId: "m", timestamp: "1", signature: "" }, body, SECRET)).toBe(false);
    expect(await verifyResendWebhookSignature({ msgId: "m", timestamp: "1", signature: "v1,x" }, body, "")).toBe(false);
  });

  it("parseResendEvent normalizes a Resend payload", () => {
    const evt = parseResendEvent({
      event: "email.delivered",
      created_at: "2026-08-16T00:00:00Z",
      data: {
        id: "re_123",
        email_id: "email_1",
        to: ["user@example.com", "cc@example.com"],
        subject: "Your confirm link",
        tags: [{ name: "kind", value: "confirm" }],
      },
    });
    expect(evt).toMatchObject({
      event: "email.delivered",
      messageId: "re_123",
      toEmail: "user@example.com",
      subject: "Your confirm link",
    });
    expect(evt!.tags).toEqual([{ name: "kind", value: "confirm" }]);
    expect(normalizeResendEventName(evt!.event)).toBe("delivered");
  });

  it("parseResendEvent rejects garbage", () => {
    expect(parseResendEvent("not-json")).toBeNull();
    expect(parseResendEvent({})).toBeNull();
    expect(parseResendEvent(JSON.stringify({ foo: 1 }))).toBeNull();
  });

  it("normalizeResendEventName strips the email. prefix", () => {
    expect(normalizeResendEventName("email.bounced")).toBe("bounced");
    expect(normalizeResendEventName("email.delivery_delayed")).toBe("delivery_delayed");
    expect(normalizeResendEventName("email.sent")).toBe("sent");
  });
});

describe("resend-webhook EF wiring (source contract)", () => {
  const src = readFileSync(join(process.cwd(), "supabase", "functions", "resend-webhook", "index.ts"), "utf8");

  it("verifies the Svix signature before trusting anything", () => {
    expect(src).toMatch(/svix-id/);
    expect(src).toMatch(/svix-timestamp/);
    expect(src).toMatch(/svix-signature/);
    expect(src).toMatch(/verifyResendWebhookSignature/);
    expect(src).toMatch(/invalid-signature/);
    expect(src).toMatch(/RESEND_WEBHOOK_SECRET/);
  });

  it("records into resend_delivery_events via service role", () => {
    expect(src).toMatch(/resend_delivery_events/);
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).toMatch(/no-verify-jwt/);
  });

  it("fails closed when the secret is missing", () => {
    expect(src).toMatch(/resend-webhook-secret-not-configured/);
    expect(src).toMatch(/500/);
  });

  it("forwards email.received events to the founder inbox", () => {
    expect(src).toMatch(/email\.received/);
    expect(src).toMatch(/EMAIL_FORWARD_TO/);
    expect(src).toMatch(/FORWARD_TO_DEFAULT/);
    expect(src).toMatch(/\/emails\/receiving\//);
    expect(src).toMatch(/reply_to/);
    expect(src).toMatch(/RESEND_API_KEY/);
  });

  it("forwards TEXT-ONLY and validates reply_to (SEC-P2-7: no HTML relay)", () => {
    expect(src).not.toMatch(/body\.html = meta\.html/);
    expect(src).toMatch(/TEXT-ONLY/);
    expect(src).toMatch(/replyCandidate/);
  });
});