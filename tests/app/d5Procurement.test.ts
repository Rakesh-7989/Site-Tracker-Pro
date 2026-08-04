// SiteTrack Pro — v4 D5 procurement quote pure-helper tests.
// Pure functions only (quoteTotal, isComparable, bestQuote, QUOTE_NEXT +
// domain constants) — no client injected.

import { describe, it, expect } from "vitest";
import {
  quoteTotal, isComparable, bestQuote, QUOTE_NEXT, QUOTE_STATUSES,
  type ProcurementQuote, type QuoteStatus,
} from "@/app/procurementQuotes";

function q(overrides: Partial<ProcurementQuote> = {}): ProcurementQuote {
  return {
    id: "q1", orgId: "o1", ffeEntryId: null, projectId: null, vendorId: "v1",
    vendorName: "Vendor A", itemName: "Chair", unitPrice: 1000, qty: 2,
    leadDays: 10, validUntil: null, status: "received", notes: null,
    createdBy: null, createdAt: "2026-08-01T00:00:00Z", ...overrides,
  };
}

describe("procurementQuotes quoteTotal", () => {
  it("is qty × unit price", () => {
    expect(quoteTotal(q())).toBe(2000);
    expect(quoteTotal(q({ unitPrice: 500, qty: 4 }))).toBe(2000);
  });

  it("clamps qty to at least 1 and unit price to ≥ 0", () => {
    expect(quoteTotal(q({ qty: 0, unitPrice: 100 }))).toBe(100);
    expect(quoteTotal(q({ qty: 3, unitPrice: 0 }))).toBe(0);
  });

  it("handles missing/NaN inputs without throwing", () => {
    expect(quoteTotal(q({ qty: Number.NaN, unitPrice: 100 }))).toBe(100);
    expect(quoteTotal(q({ qty: 2, unitPrice: Number.NaN }))).toBe(0);
  });
});

describe("procurementQuotes isComparable", () => {
  it("is true for a received quote with no expiry", () => {
    expect(isComparable(q({ status: "received" }), "2026-08-15")).toBe(true);
  });

  it("is true within valid_until", () => {
    expect(isComparable(q({ validUntil: "2026-09-01" }), "2026-08-15")).toBe(true);
  });

  it("is false for non-received statuses", () => {
    for (const s of ["requested", "selected", "rejected"] as QuoteStatus[]) {
      expect(isComparable(q({ status: s }), "2026-08-15")).toBe(false);
    }
  });

  it("is false when past valid_until", () => {
    expect(isComparable(q({ validUntil: "2026-07-01" }), "2026-08-15")).toBe(false);
  });

  it("returns true for malformed dates instead of throwing", () => {
    expect(isComparable(q({ validUntil: "garbage" }), "2026-08-15")).toBe(true);
  });
});

describe("procurementQuotes bestQuote", () => {
  it("returns the cheapest qty-adjusted received quote", () => {
    const quotes = [
      q({ id: "a", unitPrice: 1000, qty: 2, validUntil: null }), // total 2000
      q({ id: "b", unitPrice: 900, qty: 3, validUntil: null }),  // total 2700
      q({ id: "c", unitPrice: 750, qty: 2, validUntil: null }),  // total 1500 ← best
    ];
    expect(bestQuote(quotes, "2026-08-15")?.id).toBe("c");
  });

  it("skips requested/selected/rejected and expired quotes", () => {
    const quotes = [
      q({ id: "req", status: "requested", unitPrice: 1 }),
      q({ id: "sel", status: "selected", unitPrice: 1 }),
      q({ id: "rej", status: "rejected", unitPrice: 1 }),
      q({ id: "exp", status: "received", unitPrice: 1, validUntil: "2026-01-01" }),
      q({ id: "live", status: "received", unitPrice: 500 }),
    ];
    expect(bestQuote(quotes, "2026-08-15")?.id).toBe("live");
  });

  it("returns null when nothing is comparable", () => {
    expect(bestQuote([], "2026-08-15")).toBeNull();
    expect(bestQuote([q({ status: "requested" })], "2026-08-15")).toBeNull();
  });

  it("tie-breaks to the first received quote in list order", () => {
    const quotes = [
      q({ id: "a", unitPrice: 100, qty: 2 }),
      q({ id: "b", unitPrice: 100, qty: 2 }),
    ];
    expect(bestQuote(quotes, "2026-08-15")?.id).toBe("a");
  });
});

describe("procurementQuotes QUOTE_NEXT + constants", () => {
  it("matches the DB CHECK constraint (153)", () => {
    expect(QUOTE_STATUSES).toEqual(["requested", "received", "selected", "rejected"]);
  });

  it("advances requested→received→selected→rejected→received", () => {
    expect(QUOTE_NEXT.requested).toBe("received");
    expect(QUOTE_NEXT.received).toBe("selected");
    expect(QUOTE_NEXT.selected).toBe("rejected");
    expect(QUOTE_NEXT.rejected).toBe("received");
  });

  it("every status has a next step in the FSM", () => {
    (QUOTE_STATUSES as readonly QuoteStatus[]).forEach(s => {
      expect(QUOTE_NEXT[s]).toBeDefined();
    });
  });
});
