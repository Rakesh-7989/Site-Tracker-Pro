// SiteTrack Pro — local-timezone date helper tests.
// These catch the UTC-vs-local regression (toISOString resolves to the
// previous day in IST between 00:00–05:29) that the billing/time tabs rely on.

import { describe, it, expect } from "vitest";
import { localDateISO, currentMonthRange } from "@/lib/utils/dateLocal";

describe("localDateISO", () => {
  it("formats a fixed local date as YYYY-MM-DD", () => {
    expect(localDateISO(new Date(2026, 7, 31, 1, 30))).toBe("2026-08-31");
    expect(localDateISO(new Date(2026, 0, 5, 23, 0))).toBe("2026-01-05");
  });

  it("does NOT shift for early-morning local times (IST edge case)", () => {
    // 2026-08-01 01:00 local would be 2026-07-31 19:30 UTC — toISOString()
    // would say "2026-07-31". The helper must keep the local date.
    expect(localDateISO(new Date(2026, 7, 1, 1, 0))).toBe("2026-08-01");
  });

  it("zero-pads month and day", () => {
    expect(localDateISO(new Date(2026, 8, 9))).toBe("2026-09-09");
  });
});

describe("currentMonthRange", () => {
  it("returns the first + last day of the local month", () => {
    expect(currentMonthRange(new Date(2026, 7, 15))).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("handles short months and leap February", () => {
    expect(currentMonthRange(new Date(2026, 3, 10))).toEqual({ from: "2026-04-01", to: "2026-04-30" });
    expect(currentMonthRange(new Date(2024, 1, 10))).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("keeps the local month even on the 1st at 01:00 (IST edge case)", () => {
    expect(currentMonthRange(new Date(2026, 7, 1, 1, 0)).from).toBe("2026-08-01");
  });
});
