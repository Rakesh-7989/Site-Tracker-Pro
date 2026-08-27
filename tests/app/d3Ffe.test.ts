// SiteTrack Pro — v4 D3 FF&E schedule pure-helper tests.
// Pure functions only (budget rollup / committed cost / status helpers) — no
// client injected.

import { describe, it, expect } from "vitest";
import {
  committedCost, ffeBudgetRollup, isCommittedStatus,
  FFE_CATEGORIES, FFE_STATUSES,
  type FfeStatus,
} from "@/app/queries/ffeQueries";

describe("ffeQueries committedCost", () => {
  it("is qty × unit_cost for non-cancelled entries", () => {
    expect(committedCost({ qty: 4, unitCost: 2500, status: "specified" })).toBe(10000);
    expect(committedCost({ qty: 4, unitCost: 2500, status: "installed" })).toBe(10000);
  });

  it("excludes cancelled entries entirely", () => {
    expect(committedCost({ qty: 4, unitCost: 2500, status: "cancelled" })).toBe(0);
  });
});

describe("ffeQueries isCommittedStatus", () => {
  it("treats selected/ordered/installed as procurement-active", () => {
    expect(isCommittedStatus("selected")).toBe(true);
    expect(isCommittedStatus("ordered")).toBe(true);
    expect(isCommittedStatus("installed")).toBe(true);
  });

  it("treats specified/cancelled as not procurement-active", () => {
    expect(isCommittedStatus("specified")).toBe(false);
    expect(isCommittedStatus("cancelled")).toBe(false);
  });
});

describe("ffeQueries ffeBudgetRollup", () => {
  it("rolls up committed + procured totals", () => {
    const r = ffeBudgetRollup([
      { qty: 4, unitCost: 2500, status: "specified", spaceOrRoom: "Lobby" },
      { qty: 2, unitCost: 10000, status: "ordered", spaceOrRoom: "Lobby" },
      { qty: 1, unitCost: 5000, status: "cancelled", spaceOrRoom: "Boardroom" },
    ]);
    expect(r.count).toBe(3);
    // 4×2500 + 2×10000 (cancelled excluded)
    expect(r.committed).toBe(30000);
    // ordered only
    expect(r.procured).toBe(20000);
  });

  it("groups per-space-or-room and buckets blank to General", () => {
    const r = ffeBudgetRollup([
      { qty: 1, unitCost: 100, status: "installed", spaceOrRoom: "Lobby" },
      { qty: 2, unitCost: 50, status: "selected", spaceOrRoom: "Lobby" },
      { qty: 1, unitCost: 75, status: "specified", spaceOrRoom: "" },
    ]);
    const lobby = r.bySpace.find(b => b.space === "Lobby");
    const general = r.bySpace.find(b => b.space === "General");
    expect(lobby?.committed).toBe(200);
    expect(lobby?.count).toBe(2);
    expect(general?.committed).toBe(75);
    expect(general?.count).toBe(1);
  });

  it("sorts spaces by committed descending", () => {
    const r = ffeBudgetRollup([
      { qty: 1, unitCost: 10, status: "specified", spaceOrRoom: "A" },
      { qty: 1, unitCost: 500, status: "specified", spaceOrRoom: "B" },
      { qty: 1, unitCost: 50, status: "specified", spaceOrRoom: "C" },
    ]);
    expect(r.bySpace.map(b => b.space)).toEqual(["B", "C", "A"]);
  });

  it("returns empty rollup for no entries", () => {
    const r = ffeBudgetRollup([]);
    expect(r).toEqual({ committed: 0, procured: 0, count: 0, bySpace: [] });
  });
});

describe("ffeQueries domain constants", () => {
  it("matches the DB CHECK constraints (151)", () => {
    expect(FFE_CATEGORIES).toEqual(["furniture", "fixture", "equipment"]);
    expect(FFE_STATUSES).toEqual(["specified", "selected", "ordered", "installed", "cancelled"]);
  });

  it("every status has a defined committed-cost path", () => {
    (FFE_STATUSES as readonly FfeStatus[]).forEach(s => {
      expect(typeof isCommittedStatus(s)).toBe("boolean");
      expect(typeof committedCost({ qty: 1, unitCost: 0, status: s })).toBe("number");
    });
  });
});
