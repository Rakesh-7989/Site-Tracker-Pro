// SiteTrack Pro — P-E edge-function contracts.
//
// Source-parsing contracts (efRegisterOrg pattern) that lock the P-E behaviors
// of the two edge functions touched in Phase E:
//   • cashfree-webhook must handle Cashfree PAYMENT_LINK_EVENTs (the one-time
//     signup payment) and mark the signup paid (paid_at, paid_amount_paise),
//     NOT just subscription events.
//   • review_signup_request must provision NEW auth users with a temp password
//     (admin.auth.admin.createUser + email + profiles.must_change_password)
//     and seed billing_history for gateway-paid signups once the org exists.
// A future edit can't silently drop either.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webhook = readFileSync(join(process.cwd(), "supabase", "functions", "cashfree-webhook", "index.ts"), "utf8");
const review = readFileSync(join(process.cwd(), "supabase", "functions", "review_signup_request", "index.ts"), "utf8");

describe("cashfree-webhook — payment-link events (P-E)", () => {
  it("detects PAYMENT_LINK_EVENTs and routes them to a dedicated handler", () => {
    expect(webhook).toMatch(/PAYMENT_LINK_EVENT/);
    expect(webhook).toMatch(/handlePaymentLinkEvent/);
    expect(webhook).toMatch(/isPaymentLinkEvent/);
    expect(webhook).toContain("link_status");
  });

  it("reconciles via link_meta.signup_request_id or the stashed payment_ref", () => {
    expect(webhook).toMatch(/link_meta\?\.signup_request_id/);
    expect(webhook).toMatch(/payment_ref/);
    expect(webhook).toContain("signup_requests");
  });

  it("marks the signup paid on a PAID link (status + paid_at + paid_amount_paise)", () => {
    expect(webhook).toMatch(/payment_status: "paid"/);
    expect(webhook).toMatch(/paid_at: new Date\(\)\.toISOString\(\)/);
    expect(webhook).toContain("paid_amount_paise");
  });

  it("acks idempotent / orphan / non-paid events instead of erroring", () => {
    expect(webhook).toContain("already paid");
    expect(webhook).toContain("orphan payment link");
    expect(webhook).toContain("ok (no link id)");
  });

  it("sends a fire-and-forget paid notification email (Resend, opt-out when unconfigured)", () => {
    expect(webhook).toMatch(/notifySignupPaid/);
    expect(webhook).toContain("RESEND_API_KEY");
  });
});

describe("review_signup_request — temp password + billing_history (P-E)", () => {
  it("creates NEW auth users with a generated temp password via the admin API", () => {
    expect(review).toMatch(/admin\.auth\.admin\.createUser/);
    expect(review).toMatch(/generateTempPassword/);
    expect(review).toContain("email_confirm");
  });

  it("emails the temp password and flags the profile for a forced change", () => {
    expect(review).toMatch(/sendTempPasswordEmail/);
    expect(review).toMatch(/must_change_password/);
    expect(review).toMatch(/tempPasswordIssued/);
  });

  it("keeps the magic-link fallback for already-registered emails", () => {
    expect(review).toMatch(/magiclink/);
    expect(review).toMatch(/isAlreadyRegistered/);
    expect(review).toMatch(/existing-user-link-failed/);
  });

  it("seeds billing_history for gateway-paid signups at org creation", () => {
    expect(review).toMatch(/seedBillingHistory/);
    expect(review).toMatch(/billing_history/);
    expect(review).toContain("provider: \"cashfree\"");
    expect(review).toContain("status: \"succeeded\"");
    expect(review).toContain("paid_amount_paise");
  });

  it("surfaces the new outcome flags in the response", () => {
    expect(review).toContain("tempPasswordIssued");
    expect(review).toContain("billingSeeded");
  });
});
