// SiteTrack Pro — Razorpay edge-function contracts.
//
// Source-parsing contracts (efPaymentPhase pattern) that lock the Razorpay
// behaviors shipped with migration 253:
//   • razorpay-payment-link must POST to the Razorpay Payment Links API,
//     carry sitetrack_invoice_id in notes, and persist the created link.
//   • razorpay-webhook must verify the HMAC-SHA256 signature, parse the
//     NESTED payload (payload.payment_link.entity / payload.payment.entity),
//     resolve the invoice via notes → razorpay_payment_link_id fallback, and
//     map both payment_link.* and payment.* events to invoice statuses.
// A future edit can't silently drop either.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const paymentLink = readFileSync(join(process.cwd(), "supabase", "functions", "razorpay-payment-link", "index.ts"), "utf8");
const webhook = readFileSync(join(process.cwd(), "supabase", "functions", "razorpay-webhook", "index.ts"), "utf8");

describe("razorpay-payment-link — create payment link (mig 253)", () => {
  it("POSTs to the Razorpay Payment Links API with Basic key auth", () => {
    expect(paymentLink).toContain("RAZORPAY_BASE");
    expect(paymentLink).toContain("https://api.razorpay.com/v1");
    expect(paymentLink).toContain("RAZORPAY_KEY_ID");
    expect(paymentLink).toContain("RAZORPAY_KEY_SECRET");
    expect(paymentLink).toContain("Authorization: `Basic ${auth}`");
  });

  it("carries sitetrack_invoice_id in the payment-link notes", () => {
    expect(paymentLink).toContain("sitetrack_invoice_id");
  });

  it("persists the created link id + created status on the invoice", () => {
    expect(paymentLink).toMatch(/razorpay_payment_link_id: razorpayResponse\.id/);
    expect(paymentLink).toMatch(/razorpay_status: "created"/);
  });

  it("rejects an already-paid invoice", () => {
    expect(paymentLink).toContain("already-paid");
  });

  it("returns the short_url for sharing", () => {
    expect(paymentLink).toContain("short_url: razorpayResponse.short_url");
  });

  it("supports mode=get to fetch an existing link (get short_url fallback)", () => {
    expect(paymentLink).toMatch(/mode = "create"/);
    expect(paymentLink).toContain("mode === \"get\"");
    expect(paymentLink).toContain("method: \"GET\"");
    expect(paymentLink).toMatch(/payment_links\/\$\{existingLinkId\}/);
    expect(paymentLink).toContain("falling back to create:");
  });

  it("resolves Razorpay credentials from org_integrations first", () => {
    expect(paymentLink).toContain("org_integrations");
    expect(paymentLink).toContain("razorpay.key_secret");
  });

  it("derives the org from the project, not a non-existent invoices.org_id", () => {
    expect(paymentLink).not.toContain("invoices.org_id");
    expect(paymentLink).toMatch(/from\("invoices"\)\s*\n\s*\.select\("id, project_id, amount, status, razorpay_payment_link_id"\)/);
    expect(paymentLink).toMatch(/\.from\("projects"\)\s*\n\s*\.select\("org_id"\)\s*\n\s*\.eq\("id", invoice\.project_id\)/);
  });

  it("verifies the JWT via authenticate() instead of a presence check (P0 IDOR fix)", () => {
    expect(paymentLink).toContain('from "../_shared/auth.ts"');
    expect(paymentLink).toMatch(/await authenticate\(req\)/);
    expect(paymentLink).toContain("if (!auth.ok) return auth.response;");
  });

  it("enforces invoice-org membership (or platform staff) before minting", () => {
    expect(paymentLink).toContain("not-org-member");
    expect(paymentLink).toMatch(/auth\.orgMemberships\.some/);
    expect(paymentLink).toContain("isPlatformStaff");
  });

  it("rejects a mismatched project_id hint (project-mismatch)", () => {
    expect(paymentLink).toContain("project-mismatch");
  });
});

describe("razorpay-webhook — nested payload + status mapping (mig 253)", () => {
  it("verifies the webhook signature with HMAC-SHA256 over the raw body", () => {
    expect(webhook).toContain("crypto.subtle.importKey");
    expect(webhook).toContain("x-razorpay-signature");
    expect(webhook).toContain("HMAC");
  });

  it("rejects invalid signatures with 401", () => {
    expect(webhook).toContain("Invalid signature");
  });

  it("parses the nested payload.payment_link.entity / payload.payment.entity", () => {
    expect(webhook).toContain("payload.payment_link?.entity");
    expect(webhook).toContain("payload.payment?.entity");
  });

  it("resolves the invoice from notes first, then razorpay_payment_link_id", () => {
    expect(webhook).toContain("sitetrack_invoice_id");
    expect(webhook).toContain("razorpay_payment_link_id");
    expect(webhook).toMatch(/maybeSingle\(\)/);
  });

  it("maps both payment_link.* and payment.* events to invoice statuses", () => {
    expect(webhook).toContain("\"payment_link.paid\": \"paid\"");
    expect(webhook).toContain("\"payment_link.cancelled\": \"cancelled\"");
    expect(webhook).toContain("\"payment_link.expired\": \"expired\"");
    expect(webhook).toContain("\"payment_link.partially_paid\": \"partial\"");
    expect(webhook).toContain("\"payment.captured\": \"paid\"");
    expect(webhook).toContain("\"payment.failed\": \"failed\"");
    expect(webhook).toContain("[eventType] || \"pending\"");
  });

  it("acks unknown events without erroring (Razorpay retry backstop)", () => {
    expect(webhook).toContain("ignored: true");
  });
});

describe("migration 253 — razorpay status CHECK admits created/partial", () => {
  const mig = readFileSync(join(process.cwd(), "scripts", "supabase", "253_razorpay_payment_links.sql"), "utf8");
  it("admits every status the EFs write", () => {
    expect(mig).toContain("'created'");
    expect(mig).toContain("'partial'");
    expect(mig).toContain("'paid'");
    expect(mig).toContain("'failed'");
    expect(mig).toContain("'expired'");
    expect(mig).toContain("'cancelled'");
  });
});