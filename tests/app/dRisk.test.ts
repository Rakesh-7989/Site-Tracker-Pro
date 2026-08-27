// SiteTrack Pro — v4 Phase D: deterministic risk analytics tests.
// Pure functions across fixture data: milestones slip, budget burn, issues,
// RFI lag, score/level/probability folding, plus riskLevel boundaries.

import { describe, it, expect } from "vitest";
import { computeRiskSignals, riskLevel } from "@/app/queries/riskQueries";

const TODAY = "2026-08-07";

describe("riskQueries computeRiskSignals", () => {
  it("returns low/no signals when nothing is at risk", () => {
    const r = computeRiskSignals({
      milestones: [{ status: "completed", dueDate: "2026-07-01" }, { status: "pending", dueDate: "2026-08-20" }],
      budget: { allocated: 1000, spent: 400 },
      openIssues: [{ severity: "low" }],
      rfis: [{ status: "answered", askedAt: "2026-08-01" }],
    }, TODAY);
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
    expect(r.delayProbability).toBe(0);
    expect(r.signals).toEqual([]);
  });

  it("flags a milestone overdue by >= 3 days as a schedule slip", () => {
    const r = computeRiskSignals({
      milestones: [{ status: "pending", dueDate: "2026-08-01" }],
    }, TODAY);
    expect(r.signals.some(s => s.code === "schedule_slip")).toBe(true);
    expect(r.delayDays).toBe(6);
  });

  it("ignores a pending milestone that is barely late (< 3 days)", () => {
    const r = computeRiskSignals({
      milestones: [{ status: "pending", dueDate: "2026-08-05" }],
    }, TODAY);
    expect(r.signals).toEqual([]);
  });

  it("does not flag a completed milestone that is past due", () => {
    const r = computeRiskSignals({
      milestones: [{ status: "completed", dueDate: "2026-07-01" }],
    }, TODAY);
    expect(r.signals).toEqual([]);
  });

  it("flags an over-budget project (spent >= allocated)", () => {
    const r = computeRiskSignals({ budget: { allocated: 1000, spent: 1000 } }, TODAY);
    expect(r.signals.some(s => s.code === "budget_overrun")).toBe(true);
  });

  it("flags heavy budget burn between 80% and 100%", () => {
    const r = computeRiskSignals({ budget: { allocated: 1000, spent: 850 } }, TODAY);
    expect(r.signals.some(s => s.code === "budget_burn")).toBe(true);
  });

  it("does not flag moderate burn below 80%", () => {
    const r = computeRiskSignals({ budget: { allocated: 1000, spent: 700 } }, TODAY);
    expect(r.signals).toEqual([]);
  });

  it("flags open high-severity issues", () => {
    const r = computeRiskSignals({ openIssues: [{ severity: "high" }, { severity: "high" }] }, TODAY);
    expect(r.signals.some(s => s.code === "high_severity_issues")).toBe(true);
  });

  it("does not flag resolved / low issues", () => {
    const r = computeRiskSignals({ openIssues: [{ severity: "low" }, { severity: "medium" }] }, TODAY);
    expect(r.signals).toEqual([]);
  });

  it("flags an open RFI older than the lag window", () => {
    const r = computeRiskSignals({
      rfis: [{ status: "open", askedAt: "2026-07-01" }, { status: "answered", askedAt: "2026-06-01" }],
    }, TODAY);
    expect(r.signals.some(s => s.code === "rfi_lag")).toBe(true);
  });

  it("does not flag a fresh RFI", () => {
    const r = computeRiskSignals({ rfis: [{ status: "open", askedAt: "2026-08-07" }] }, TODAY);
    expect(r.signals).toEqual([]);
  });

  it("folds multiple medium signals into a high score / level", () => {
    const r = computeRiskSignals({
      milestones: [{ status: "pending", dueDate: "2026-07-01" }],
      budget: { allocated: 1000, spent: 900 },
      openIssues: [{ severity: "high" }],
    }, TODAY);
    expect(r.score).toBeGreaterThanOrEqual(34);
    expect(r.signals.length).toBeGreaterThanOrEqual(3);
  });

  it("ignores a missing budget dimension entirely", () => {
    const r = computeRiskSignals({ openIssues: [{ severity: "high" }] }, TODAY);
    expect(r.signals.some(s => s.code === "budget_burn")).toBe(false);
  });
});

describe("riskQueries riskLevel boundaries", () => {
  it("bands scores 0–100 into low/medium/high/critical", () => {
    expect(riskLevel(0)).toBe("low");
    expect(riskLevel(24)).toBe("low");
    expect(riskLevel(25)).toBe("medium");
    expect(riskLevel(44)).toBe("medium");
    expect(riskLevel(45)).toBe("high");
    expect(riskLevel(69)).toBe("high");
    expect(riskLevel(70)).toBe("critical");
    expect(riskLevel(100)).toBe("critical");
  });
});