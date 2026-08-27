// SiteTrack Pro — P-F sweep: pay-page amount correctness tests.
// Covers resolveSignupAmount precedence (recorded paise → DB plan amount →
// legacy tier fallback → null) and the getSignupForPay row mapper.

import { describe, it, expect, vi } from "vitest";
import { resolveSignupAmount, getSignupForPay } from "@/app/queries/paymentQueries";

describe("resolveSignupAmount", () => {
  const tiers = [
    { id: "basic", annual: 70788 },
    { id: "pro", annual: 141588 },
    { id: "business", annual: 235988 },
  ];

  it("prefers the recorded charge (paidAmountPaise) over everything", () => {
    const amount = resolveSignupAmount(
      { paidAmountPaise: 999999, planAmountInr: 141588, plan: "pro" },
      tiers,
    );
    expect(amount).toBe(10000); // 999999 paise / 100 = 9999.99 → 10000
  });

  it("uses the DB plan amount (planAmountInr) when no recorded charge", () => {
    expect(resolveSignupAmount({ paidAmountPaise: null, planAmountInr: 141588, plan: "pro" }, tiers))
      .toBe(141588);
  });

  it("falls back to the legacy tier list for known plans", () => {
    expect(resolveSignupAmount({ paidAmountPaise: null, planAmountInr: null, plan: "basic" }, tiers))
      .toBe(70788);
  });

  it("resolves a custom plan via the DB amount (no frontend tier)", () => {
    expect(resolveSignupAmount({ paidAmountPaise: null, planAmountInr: 94388, plan: "custom" }, tiers))
      .toBe(94388);
  });

  it("returns null when nothing resolves (custom plan without DB row)", () => {
    expect(resolveSignupAmount({ paidAmountPaise: null, planAmountInr: null, plan: "custom" }, tiers))
      .toBeNull();
  });

  it("treats zero/negative stored values as absent", () => {
    expect(resolveSignupAmount({ paidAmountPaise: 0, planAmountInr: 141588, plan: "pro" }, tiers))
      .toBe(141588);
    expect(resolveSignupAmount({ paidAmountPaise: -5, planAmountInr: null, plan: "pro" }, tiers))
      .toBe(141588);
  });

  it("works with no tier list provided (pure DB-driven)", () => {
    expect(resolveSignupAmount({ paidAmountPaise: null, planAmountInr: 235988, plan: "business" }))
      .toBe(235988);
  });
});

describe("getSignupForPay", () => {
  it("maps the DB row including plan_amount_inr + paid_amount_paise", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [{ firm_name: "Firm", plan: "custom", email: "a@b.c", payment_status: "unpaid", plan_amount_inr: 94388, paid_amount_paise: null }], error: null }) };
    const res = await getSignupForPay(client, "req-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.firmName).toBe("Firm");
    expect(res.data.plan).toBe("custom");
    expect(res.data.paymentStatus).toBe("unpaid");
    expect(res.data.planAmountInr).toBe(94388);
    expect(res.data.paidAmountPaise).toBeNull();
  });

  it("maps null amounts from the row", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [{ firm_name: "F", plan: "pro", email: "a@b.c", payment_status: "unpaid", plan_amount_inr: null, paid_amount_paise: null }], error: null }) };
    const res = await getSignupForPay(client, "req-2");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.planAmountInr).toBeNull();
    expect(res.data.paidAmountPaise).toBeNull();
  });

  it("surfaces RPC errors", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) };
    const res = await getSignupForPay(client, "req-3");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("boom");
  });

  it("returns not-found when the row is missing", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const res = await getSignupForPay(client, "req-4");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("not found");
  });
});
