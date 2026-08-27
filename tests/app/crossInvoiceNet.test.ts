// Locks the net-receivable formula after migration 239: GST/TDS columns are
// PERCENTAGES, so net = amount × (1 + gst% − tds%) — matching the server-side
// payment cap exactly. Regression for the old flat-add bug (₹100k @18/2 used
// to show ₹100,016 instead of ₹116,000).

import { describe, expect, it } from "vitest";
import { netReceivable, outstanding } from "@/app/queries/crossInvoiceQueries";

describe("netReceivable (percentage-based, aligned with mig-239 cap)", () => {
  it("computes amount × (1 + gst% − tds%)", () => {
    expect(netReceivable(100_000, 18, 2)).toBe(116_000);
    expect(netReceivable(100_000, 0, 0)).toBe(100_000);
    expect(netReceivable(250_000, 18, 2)).toBe(290_000);
    expect(netReceivable(50_000, 5, 0)).toBe(52_500);
  });

  it("rounds half-up on fractional results", () => {
    // 33_333 × 1.16 = 38_666.28 → 38_666
    expect(netReceivable(33_333, 18, 2)).toBe(38_666);
    // 33_335 × 1.16 = 38_668.60 → 38_669
    expect(netReceivable(33_335, 18, 2)).toBe(38_669);
  });

  it("coerces non-finite inputs defensively", () => {
    expect(netReceivable(Number.NaN, 18, 2)).toBe(0);
    expect(netReceivable(10_000, Number.NaN, Number.NaN)).toBe(10_000);
  });

  it("outstanding clamps at zero", () => {
    expect(outstanding(116_000, 50_000)).toBe(66_000);
    expect(outstanding(116_000, 120_000)).toBe(0);
  });
});
