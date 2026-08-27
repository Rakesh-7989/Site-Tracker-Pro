// SiteTrack Pro — stored risk-snapshot reader tests (migrations 225/226).
// Covers the pure mapper, freshness window and the client-injected fetch
// (happy path, absent row, error surface) for project_risk_signals.

import { describe, it, expect } from "vitest";
import {
  mapRiskSignalsRow,
  isSnapshotFresh,
  getProjectRiskSnapshot,
  RISK_SNAPSHOT_MAX_AGE_HOURS,
} from "@/app/queries/riskQueries";

const H = 3_600_000;

function makeClient(data: unknown, error: { message?: string } | null = null) {
  return {
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_c2: string, _v: string) => ({
          maybeSingle: async () => ({ data: data as never, error }),
        }),
      }),
    }),
  };
}

describe("mapRiskSignalsRow()", () => {
  it("maps snake_case row + signals array to camelCase snapshot", () => {
    const snap = mapRiskSignalsRow({
      project_id: "p1",
      risk_score: 88,
      risk_level: "critical",
      delay_probability: 0.88,
      delay_days: 20,
      burn_accelerating: true,
      signals: [
        { code: "schedule_slip", severity: "high", title: "2 milestones past due", detail: "Latest is 20 days overdue." },
        { code: "budget_overrun", severity: "high", title: "Budget spent", detail: "Spend is 150% of the plan." },
      ],
      updated_at: "2026-08-22T02:05:00Z",
    });
    expect(snap).not.toBeNull();
    expect(snap!.projectId).toBe("p1");
    expect(snap!.score).toBe(88);
    expect(snap!.level).toBe("critical");
    expect(snap!.delayProbability).toBe(0.88);
    expect(snap!.delayDays).toBe(20);
    expect(snap!.burnAccelerating).toBe(true);
    expect(snap!.signals).toHaveLength(2);
    expect(snap!.signals[0].code).toBe("schedule_slip");
    expect(snap!.computedAt).toBe("2026-08-22T02:05:00Z");
  });

  it("clamps out-of-range values and coerces malformed signals entries", () => {
    const snap = mapRiskSignalsRow({
      project_id: "p2",
      risk_score: 250,            // >100 → clamped
      risk_level: "bogus",        // recomputed from score via riskLevel()
      delay_probability: 5,       // >0.9 → clamped
      delay_days: -3,             // <0 → clamped
      burn_accelerating: false,
      signals: ["junk", 42, { title: "no code" }, { code: "ok", severity: "weird", title: "t", detail: "d" }],
      updated_at: null,
    });
    expect(snap!.score).toBe(100);
    expect(snap!.level).toBe("critical"); // riskLevel(100)
    expect(snap!.delayProbability).toBe(0.9);
    expect(snap!.delayDays).toBe(0);
    // junk/scalars dropped; objects kept with coerced fields
    expect(snap!.signals).toHaveLength(2);
    expect(snap!.signals[0].code).toBe("unknown");
    expect(snap!.signals[1].severity).toBe("low"); // "weird" → low
    expect(snap!.computedAt).toBe("");             // null timestamp tolerated
  });

  it("returns null for a garbage row", () => {
    expect(mapRiskSignalsRow(null as never)).toBeNull();
    expect(mapRiskSignalsRow({ risk_score: 10 } as never)).toBeNull();
  });
});

describe("isSnapshotFresh()", () => {
  it("fresh within the 26h cron window, stale beyond, invalid ts never fresh", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    expect(RISK_SNAPSHOT_MAX_AGE_HOURS).toBe(26);
    const fresh = isSnapshotFresh({ projectId: "", score: 0, level: "low", delayProbability: 0, delayDays: 0, burnAccelerating: false, signals: [], computedAt: new Date(now.getTime() - 25 * H).toISOString() }, now);
    expect(fresh).toBe(true);
    const stale = isSnapshotFresh({ projectId: "", score: 0, level: "low", delayProbability: 0, delayDays: 0, burnAccelerating: false, signals: [], computedAt: new Date(now.getTime() - 27 * H).toISOString() }, now);
    expect(stale).toBe(false);
    const bad = isSnapshotFresh({ projectId: "", score: 0, level: "low", delayProbability: 0, delayDays: 0, burnAccelerating: false, signals: [], computedAt: "not-a-date" }, now);
    expect(bad).toBe(false);
  });
});

describe("getProjectRiskSnapshot()", () => {
  it("returns mapped snapshot when a row exists", async () => {
    const res = await getProjectRiskSnapshot(makeClient({ project_id: "p1", risk_score: 40 }), "p1");
    expect(res.ok && res.data?.score === 40 && res.data.projectId === "p1").toBe(true);
  });

  it("returns ok:null when no row (project never scored)", async () => {
    const res = await getProjectRiskSnapshot(makeClient(null), "pX");
    expect(res.ok && res.data === null).toBe(true);
  });

  it("surfaces DB errors without throwing", async () => {
    const res = await getProjectRiskSnapshot(makeClient(null, { message: "permission denied" }), "p1");
    expect(!res.ok && res.error.includes("permission denied")).toBe(true);
  });
});
