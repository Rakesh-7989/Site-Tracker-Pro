// SiteTrack Pro — per-quote supplier scoring tests (v4 Phase E).

import { describe, it, expect } from "vitest";
import {
  scoreQuote, scoreQuoteAlone, bestScoredQuote, SCORE_WEIGHTS,
  type ProcurementQuote,
} from "@/app/queries/procurementQuotes";

const q = (over: Partial<ProcurementQuote>): ProcurementQuote => ({
  id: "1", orgId: "o", ffeEntryId: null, projectId: null, vendorId: "v1",
  vendorName: "ACC", itemName: "Cement", unitPrice: 100, qty: 10, leadDays: 5,
  validUntil: "2026-12-31", status: "received", notes: null, createdBy: null, createdAt: "",
  ...over,
});

describe("scoreQuote", () => {
  it("cheapest quote prices at 100, double premium at 50 (price 0.5 weight)", () => {
    const cheap = q({ id: "a", unitPrice: 100, qty: 1 }); // total 100
    const pricy = q({ id: "b", unitPrice: 200, qty: 1 }); // total 200
    const sCheap = scoreQuote(cheap, [cheap, pricy]);
    const sPricy = scoreQuote(pricy, [cheap, pricy]);
    expect(sCheap.priceScore).toBe(100);
    expect(sPricy.priceScore).toBe(50);
    // rating/lead identical (defaults both 50) → price alone moves score
    expect(sCheap.score).toBeGreaterThan(sPricy.score);
    expect(sCheap.score - sPricy.score).toBe(Math.round(0.5 * 50));
  });

  it("shorter lead scores higher (lead 0.3 weight); neutral when unstated", () => {
    const fast = q({ id: "a", unitPrice: 100, qty: 1, leadDays: 2 });
    const slow = q({ id: "b", unitPrice: 100, qty: 1, leadDays: 8 });
    expect(scoreQuote(fast, [fast, slow]).leadScore).toBe(100);
    expect(scoreQuote(slow, [fast, slow]).leadScore).toBe(Math.round(2 / 8 * 100));
    const noLead = q({ id: "c", unitPrice: 100, qty: 1, leadDays: null });
    expect(scoreQuote(noLead, [fast, slow, noLead]).leadScore).toBe(50);
  });

  it("vendor rating 0–5 lifts the score (rating 0.2 weight)", () => {
    const base = q({ id: "a", unitPrice: 100, qty: 1, leadDays: 5 });
    // single-peer pool → price + lead both score 100; only rating moves total
    const s0 = scoreQuote(base, [base], 0);    // 0.5 + 0.3 + 0 = 80
    const s5 = scoreQuote(base, [base], 5);    // 0.5 + 0.3 + 0.2 = 100
    const sNone = scoreQuote(base, [base]);    // 0.5 + 0.3 + 0.1 = 90
    expect(s5.ratingScore).toBe(100);
    expect(s0.ratingScore).toBe(0);
    expect(sNone.ratingScore).toBe(50);
    expect(s5.score - s0.score).toBe(20); // 0.2 × 100
    expect(sNone.score).toBe(90); // single-peer composite (price+lead=100)
  });

  it("exposes weights for documentation/tests", () => {
    expect(SCORE_WEIGHTS).toEqual({ price: 0.5, lead: 0.3, rating: 0.2 });
  });
});

describe("scoreQuoteAlone", () => {
  it("price + lead neutral at 50; rating lifts a 0–5 scale", () => {
    const none = scoreQuoteAlone();
    expect(none).toMatchObject({ priceScore: 50, leadScore: 50, score: 50 });
    const rated = scoreQuoteAlone(5);
    expect(rated.ratingScore).toBe(100);
    expect(rated.score).toBe(60); // 0.5*0.5 + 0.3*0.5 + 0.2*1.0
  });
});

describe("bestScoredQuote", () => {
  const mkRatings = (entries: Array<[string, number]>) => new Map(entries);

  it("picks the best composite scorer across the pool", () => {
    const pool = [
      q({ id: "a", unitPrice: 100, qty: 1, leadDays: 5, vendorId: "v1" }),
      q({ id: "b", unitPrice: 90, qty: 1, leadDays: 12, vendorId: "v2" }),
    ];
    // v1 rating 5 + fast lead beats v2's slightly cheaper price.
    const ratings = mkRatings([["v1", 5], ["v2", 0]]);
    const best = bestScoredQuote(pool, "2026-12-01", ratings);
    expect(best?.id).toBe("a");
  });

  it("ignores non-comparable quotes (expired/rejected/requested)", () => {
    const pool = [
      q({ id: "a", unitPrice: 100, qty: 1, status: "received" }),
      q({ id: "b", unitPrice: 50, qty: 1, status: "requested" }), // not comparable
      q({ id: "c", unitPrice: 1, qty: 1, status: "received", validUntil: "2020-01-01" }), // expired
    ];
    expect(bestScoredQuote(pool, "2026-12-01", mkRatings([]))?.id).toBe("a");
  });

  it("returns null when nothing is comparable", () => {
    const pool = [q({ id: "a", status: "requested" }), q({ id: "b", status: "rejected" })];
    expect(bestScoredQuote(pool, "2026-12-01", mkRatings([]))).toBeNull();
  });

  it("ties resolve to the lower quote total", () => {
    const pool = [
      q({ id: "a", unitPrice: 100, qty: 1, leadDays: 5, vendorId: "v1" }),
      q({ id: "b", unitPrice: 80, qty: 1, leadDays: 5, vendorId: "v2" }),
    ];
    const ratings = mkRatings([["v1", 5], ["v2", 5]]);
    const best = bestScoredQuote(pool, "2026-12-01", ratings);
    expect(best?.id).toBe("b");
  });
});
