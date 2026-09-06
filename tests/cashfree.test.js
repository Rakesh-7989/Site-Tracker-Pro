import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cashfreeBaseUrl, isCashfreeConfigured,
  buildSubscriptionRequest, buildCancellationRequest, buildUpgradeOperations,
  verifyWebhookSignature, verifyWebhookSignatureSync,
  applyWebhookEvent, mapCashfreeStatus,
} from "../src/lib/integrations/cashfree";

const org = { id: "org_12345678_abcd", name: "BuildCo India", contact_email: "owner@buildco.in" };

describe("cashfree — config helpers", () => {
  it("isCashfreeConfigured needs both app_id and secret", () => {
    expect(isCashfreeConfigured({ app_id: "x" })).toBe(false);
    expect(isCashfreeConfigured({ secret: "y" })).toBe(false);
    expect(isCashfreeConfigured({ app_id: "x", secret: "y" })).toBe(true);
    expect(isCashfreeConfigured(null)).toBe(false);
  });
  it("cashfreeBaseUrl swaps between sandbox + production", () => {
    expect(cashfreeBaseUrl({ env: "sandbox" })).toMatch(/sandbox/);
    expect(cashfreeBaseUrl({ env: "production" })).toMatch(/^https:\/\/api\.cashfree/);
    expect(cashfreeBaseUrl({})).toMatch(/sandbox/); // safe default
  });
});

describe("cashfree — buildSubscriptionRequest", () => {
  it("returns subscription_id + payload with correct plan_id", () => {
    const { subscription_id, payload } = buildSubscriptionRequest(org, "pro", "https://sitetrackpro.in/");
    expect(subscription_id).toMatch(/^st_/);
    expect(payload.plan_id).toBe("sitetrack_pro_monthly");
    expect(payload.customer_details.customer_email).toBe(org.contact_email);
    expect(payload.subscription_meta.return_url).toContain("sitetrack");
  });
  it("rejects unknown plans", () => {
    expect(() => buildSubscriptionRequest(org, "bogus", "")).toThrow();
  });
  it("rejects custom plan (negotiated manually)", () => {
    expect(() => buildSubscriptionRequest(org, "custom", "")).toThrow(/custom/i);
  });
  it("rejects missing org id", () => {
    expect(() => buildSubscriptionRequest({}, "pro", "")).toThrow();
  });
});

describe("cashfree — buildCancellationRequest", () => {
  it("uses the provided externalId + reason", () => {
    const body = buildCancellationRequest("sub_abc", "Customer churn");
    expect(body.subscription_id).toBe("sub_abc");
    expect(body.cancellation_reason).toBe("Customer churn");
  });
  it("supplies a default reason when not given", () => {
    const body = buildCancellationRequest("sub_abc");
    expect(body.cancellation_reason).toMatch(/cancel/i);
  });
  it("rejects missing externalId", () => {
    expect(() => buildCancellationRequest("")).toThrow();
  });
});

describe("cashfree — buildUpgradeOperations", () => {
  it("returns a cancel op then a create op", () => {
    const ops = buildUpgradeOperations("sub_old", org, "business", "https://x.in/");
    expect(ops.length).toBe(2);
    expect(ops[0].op).toBe("cancel");
    expect(ops[1].op).toBe("create");
    expect(ops[1].body.plan_id).toBe("sitetrack_business_monthly");
    expect(ops[1].subscription_id).toMatch(/^st_/);
  });
});

describe("cashfree — verifyWebhookSignature (async, Web Crypto)", () => {
  it("returns false for missing inputs", async () => {
    expect(await verifyWebhookSignature({})).toBe(false);
    expect(await verifyWebhookSignature({ rawBody: "x", timestamp: "1", signature: "s" })).toBe(false);
  });
  it("returns true for a valid HMAC-SHA256 signature", async () => {
    // Compute the expected signature using the same Web Crypto API the
    // function uses internally so we don't hardcode the digest.
    const enc = new TextEncoder();
    const secret = "test_webhook_secret_xyz";
    const rawBody = JSON.stringify({ event: "test", subscription_id: "sub_1" });
    const timestamp = "1716210000000";
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}${rawBody}`));
    const bytes = new Uint8Array(sigBuf);
    let bin = ""; for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    const signature = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    expect(await verifyWebhookSignature({ rawBody, timestamp, signature, secret })).toBe(true);
  });
  it("returns false when secret is wrong", async () => {
    const rawBody = "{}";
    const timestamp = "1";
    // Random signature with right format but wrong key
    expect(await verifyWebhookSignature({
      rawBody, timestamp, signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      secret: "real-secret",
    })).toBe(false);
  });
});

describe("cashfree — verifyWebhookSignatureSync (test-only fallback)", () => {
  it("calls the injected HMAC implementation", () => {
    const calls = [];
    const fakeHmac = (msg, secret) => { calls.push([msg, secret]); return "computed_sig"; };
    expect(verifyWebhookSignatureSync({
      rawBody: "{\"a\":1}", timestamp: "12345", signature: "computed_sig",
      secret: "shh", hmacImpl: fakeHmac,
    })).toBe(true);
    expect(calls[0][0]).toBe("12345{\"a\":1}");
    expect(calls[0][1]).toBe("shh");
  });
  it("rejects mismatched signature", () => {
    expect(verifyWebhookSignatureSync({
      rawBody: "x", timestamp: "1", signature: "wrong",
      secret: "shh", hmacImpl: () => "right",
    })).toBe(false);
  });
  it("fails closed on missing inputs", () => {
    expect(verifyWebhookSignatureSync({})).toBe(false);
  });
});

describe("cashfree — mapCashfreeStatus", () => {
  it("maps ACTIVE → active", () => {
    expect(mapCashfreeStatus("ACTIVE")).toBe("active");
    expect(mapCashfreeStatus("active")).toBe("active");
  });
  it("maps mandate-pending states to pending", () => {
    expect(mapCashfreeStatus("AUTHORIZED")).toBe("pending");
    expect(mapCashfreeStatus("INITIALIZED")).toBe("pending");
    expect(mapCashfreeStatus("BANK_APPROVAL_PENDING")).toBe("pending");
  });
  it("maps payment-failure states to past_due", () => {
    expect(mapCashfreeStatus("ON_HOLD")).toBe("past_due");
    expect(mapCashfreeStatus("PAUSED")).toBe("past_due");
  });
  it("maps end-of-life states to cancelled", () => {
    expect(mapCashfreeStatus("CANCELLED")).toBe("cancelled");
    expect(mapCashfreeStatus("COMPLETED")).toBe("cancelled");
  });
  it("falls back to pending on unknown", () => {
    expect(mapCashfreeStatus("WEIRD_STATE")).toBe("pending");
    expect(mapCashfreeStatus(undefined)).toBe("pending");
  });
});

describe("cashfree — applyWebhookEvent", () => {
  it("merges subscription data into the row", () => {
    const event = {
      type: "SUBSCRIPTION_STATUS_CHANGED",
      data: {
        subscription: {
          subscription_id: "sub_abc",
          plan_id: "sitetrack_business_monthly",
          subscription_status: "ACTIVE",
          current_cycle: { cycle_start: "2026-05-01", cycle_end: "2026-05-31" },
        },
      },
    };
    const next = applyWebhookEvent({}, event);
    expect(next.external_id).toBe("sub_abc");
    expect(next.plan).toBe("business");
    expect(next.status).toBe("active");
    expect(next.current_period_start).toBe("2026-05-01");
    expect(next.last_event).toBe("SUBSCRIPTION_STATUS_CHANGED");
  });
  it("ignores unrecognized plan_id without breaking", () => {
    const next = applyWebhookEvent({ plan: "pro" }, {
      data: { subscription: { plan_id: "garbage", subscription_status: "ACTIVE" } },
    });
    expect(next.plan).toBe("pro"); // keeps the existing one
    expect(next.status).toBe("active");
  });
  it("returns the row untouched for null events", () => {
    const row = { status: "active" };
    expect(applyWebhookEvent(row, null)).toEqual({ status: "active" });
  });
});

describe("cashfree-checkout EF throttling (source contract)", () => {
  const src = readFileSync(join(process.cwd(), "supabase", "functions", "cashfree-checkout", "index.ts"), "utf8");
  it("rate-limits public payment-link mints per IP (5/hr, 429)", () => {
    expect(src).toContain("x-forwarded-for");
    expect(src).toContain("rate-limited");
    expect(src).toContain("429");
    expect(src).toMatch(/from\("signup_requests"\)/);
  });
});
