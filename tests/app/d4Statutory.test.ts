// SiteTrack Pro — v4 D4 statutory approvals pure-helper tests.
// Pure functions only (isExpiring + domain constants) — no client injected.

import { describe, it, expect } from "vitest";
import {
  isExpiring, STATUTORY_KINDS, STATUTORY_STATUSES, STATUTORY_NEXT,
  type StatutoryStatus,
} from "@/app/statutoryQueries";

describe("statutoryQueries isExpiring", () => {
  it("is true within 30 days of valid_until", () => {
    expect(isExpiring("2026-09-01", "2026-08-15")).toBe(true);
    expect(isExpiring("2026-08-16", "2026-08-15")).toBe(true);
  });

  it("is false when valid_until is > 30 days away", () => {
    expect(isExpiring("2026-10-01", "2026-08-15")).toBe(false);
  });

  it("is false for null/missing valid_until", () => {
    expect(isExpiring(null, "2026-08-15")).toBe(false);
  });

  it("is false for dates in the past (already expired)", () => {
    expect(isExpiring("2026-07-01", "2026-08-15")).toBe(false);
  });

  it("honours a custom days window", () => {
    expect(isExpiring("2026-09-01", "2026-08-15", 60)).toBe(true);
    expect(isExpiring("2026-09-01", "2026-08-15", 15)).toBe(false);
  });

  it("returns false for malformed input instead of throwing", () => {
    expect(isExpiring("not-a-date", "2026-08-15")).toBe(false);
    expect(isExpiring("2026-09-01", "garbage")).toBe(false);
  });
});

describe("statutoryQueries domain constants", () => {
  it("matches the DB CHECK constraints (152)", () => {
    expect(STATUTORY_KINDS).toEqual(["fire", "municipal", "environment", "electrical", "labour", "occupancy", "other"]);
    expect(STATUTORY_STATUSES).toEqual(["draft", "applied", "approved", "rejected", "expired"]);
  });

  it("every status exists in the status list", () => {
    (STATUTORY_STATUSES as readonly StatutoryStatus[]).forEach(s => {
      expect(STATUTORY_STATUSES).toContain(s);
    });
  });

  it("STATUTORY_NEXT walks the register ladder (approved stays put, rejected→draft, expired→applied)", () => {
    expect(STATUTORY_NEXT.draft).toBe("applied");
    expect(STATUTORY_NEXT.applied).toBe("approved");
    expect(STATUTORY_NEXT.approved).toBe("approved");
    expect(STATUTORY_NEXT.rejected).toBe("draft");
    expect(STATUTORY_NEXT.expired).toBe("applied");
  });
});
