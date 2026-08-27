// SiteTrack Pro — v4 C3.4 scheduled retainer billing helper tests (pure only).
// Covers the auto-billing hint surfaced in BillingTab for active retainers whose
// billing_day matches the daily cron job (migration 147).

import { describe, it, expect } from "vitest";
import { autoBillingHint } from "@/app/queries/retainerQueries";

describe("autoBillingHint", () => {
  it("returns a hint for a valid billing day", () => {
    expect(autoBillingHint(5)).toBe("Auto-bills on day 5 each month");
  });

  it("handles 1 and 28 (legal bounds)", () => {
    expect(autoBillingHint(1)).toBe("Auto-bills on day 1 each month");
    expect(autoBillingHint(28)).toBe("Auto-bills on day 28 each month");
  });

  it("returns null for days outside 1..28 (cron cannot fire)", () => {
    expect(autoBillingHint(0)).toBeNull();
    expect(autoBillingHint(29)).toBeNull();
    expect(autoBillingHint(31)).toBeNull();
  });

  it("is defensive about malformed input", () => {
    expect(autoBillingHint(NaN)).toBeNull();
    expect(autoBillingHint(-4)).toBeNull();
  });

  it("truncates fractional billing days", () => {
    expect(autoBillingHint(7.9)).toBe("Auto-bills on day 7 each month");
  });
});
