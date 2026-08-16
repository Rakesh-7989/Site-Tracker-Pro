// SiteTrack Pro — TrialBanner tests (§5.6 Pro trial countdown pill).

import { describe, it, expect } from "vitest";
import { trialDaysLeft } from "@/features/shell/TrialBanner";

const now = new Date("2026-08-16T12:00:00Z");

describe("trialDaysLeft", () => {
  it("whole days remaining (ceil, min 1 while active)", () => {
    expect(trialDaysLeft("2026-08-17T12:00:00Z", now)).toBe(1);
    expect(trialDaysLeft("2026-08-20T12:00:00Z", now)).toBe(4);
    expect(trialDaysLeft("2026-08-30T12:00:00Z", now)).toBe(14);
  });

  it("0 when expired or boundary crossed", () => {
    expect(trialDaysLeft("2026-08-16T11:59:59Z", now)).toBe(0);
    expect(trialDaysLeft("2026-08-01T12:00:00Z", now)).toBe(0);
  });

  it("0 for null / invalid timestamps", () => {
    expect(trialDaysLeft(null, now)).toBe(0);
    expect(trialDaysLeft("garbage", now)).toBe(0);
  });
});