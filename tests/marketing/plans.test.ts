// SiteTrack Pro — marketing plan pricing helpers.

import { describe, it, expect } from "vitest";
import { PLAN_TIERS, formatINR, priceFor } from "@/features/marketing/plans";

describe("formatINR", () => {
  it("formats with Indian digit grouping + ₹, no decimals", () => {
    expect(formatINR(7999)).toBe("₹7,999");
    expect(formatINR(79990)).toBe("₹79,990");
    expect(formatINR(199990)).toBe("₹1,99,990");
    expect(formatINR(433330)).toBe("₹4,33,330");
    expect(formatINR(6665.83)).toBe("₹6,666"); // rounds
  });
});

describe("PLAN_TIERS", () => {
  it("has the 3 go-live tiers with the agreed monthly prices", () => {
    expect(PLAN_TIERS.map(t => [t.id, t.monthly])).toEqual([
      ["basic", 5999], ["pro", 11999], ["business", 19999],
    ]);
  });
  it("annual is exactly 10× monthly (2 months free)", () => {
    for (const t of PLAN_TIERS) expect(t.annual).toBe(t.monthly * 10);
  });
  it("only Pro is popular", () => {
    expect(PLAN_TIERS.filter(t => t.popular).map(t => t.id)).toEqual(["pro"]);
  });
});

describe("priceFor", () => {
  const pro = PLAN_TIERS.find(t => t.id === "pro")!;

  it("monthly → plain ₹/month, no savings fields", () => {
    const v = priceFor(pro, "monthly");
    expect(v.amount).toBe("₹11,999");
    expect(v.cadence).toBe("/month");
    expect(v.savingsAmount).toBeUndefined();
    expect(v.effectiveMonthly).toBeUndefined();
  });

  it("annual → ₹/year + effective monthly + savings + ~17%", () => {
    const v = priceFor(pro, "annual");
    expect(v.amount).toBe("₹1,19,990");
    expect(v.cadence).toBe("/year");
    expect(v.effectiveMonthly).toBe("₹9,999/mo billed annually");
    expect(v.savingsAmount).toBe("₹23,998"); // 11999×12 − 119990
    expect(v.savingsPct).toBe(17);           // round(2/12 × 100)
  });

  it("every tier saves ~17% on annual", () => {
    for (const t of PLAN_TIERS) expect(priceFor(t, "annual").savingsPct).toBe(17);
  });
});
