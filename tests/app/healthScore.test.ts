// SiteTrack Pro — R4: project-health framing over the risk model.
// Pure helpers: healthScore (100 − risk), per-dimension sub-scores, and the
// deterministic "N things need attention" list.

import { describe, it, expect } from "vitest";
import {
  healthScore, healthSubscores, topActionableSignals,
  HEALTH_DIMENSIONS, HEALTH_DIMENSION_LABEL, SIGNAL_HEALTH_DIMENSION,
} from "@/app/queries/riskQueries";
import type { RiskSignal } from "@/app/queries/riskQueries";

const sig = (code: string, severity: RiskSignal["severity"]): RiskSignal =>
  ({ code, severity, title: code, detail: `${code} detail` });

describe("riskQueries healthScore", () => {
  it("inverts a risk score to health", () => {
    expect(healthScore(0)).toBe(100);
    expect(healthScore(25)).toBe(75);
    expect(healthScore(50)).toBe(50);
    expect(healthScore(75)).toBe(25);
    expect(healthScore(100)).toBe(0);
  });

  it("rounds fractional risk scores", () => {
    expect(healthScore(0.6)).toBe(99);
    expect(healthScore(33.5)).toBe(66);
  });

  it("clamps into 0–100", () => {
    expect(healthScore(120)).toBe(0);
    expect(healthScore(-10)).toBe(100);
  });
});

describe("riskQueries healthSubscores", () => {
  it("all dimensions at 100 with no signals", () => {
    const s = healthSubscores([]);
    for (const dim of HEALTH_DIMENSIONS) expect(s[dim]).toBe(100);
  });

  it("maps signals onto their dimension (schedule / issues / documentation)", () => {
    const s = healthSubscores([
      sig("schedule_slip", "low"),
      sig("high_severity_issues", "medium"),
      sig("rfi_lag", "low"),
    ]);
    expect(s.schedule).toBe(90);
    expect(s.issues).toBe(80);
    expect(s.documentation).toBe(90);
    expect(s.cost).toBe(100);
  });

  it("stacks cost signals (burn + overrun)", () => {
    const s = healthSubscores([
      sig("budget_burn", "medium"),
      sig("budget_overrun", "high"),
    ]);
    expect(s.cost).toBe(46);
  });

  it("caps a dimension contribution at 100", () => {
    const s = healthSubscores([
      sig("budget_burn", "high"),
      sig("budget_overrun", "high"),
      sig("budget_overrun", "high"),
    ]);
    expect(s.cost).toBe(0);
  });

  it("ignores signals outside the known dimension map", () => {
    const s = healthSubscores([sig("some_future_signal", "high")]);
    for (const dim of HEALTH_DIMENSIONS) expect(s[dim]).toBe(100);
  });

  it("exposes stable labels and the dimension map", () => {
    expect(HEALTH_DIMENSION_LABEL.schedule).toBe("Schedule");
    expect(SIGNAL_HEALTH_DIMENSION.schedule_slip).toBe("schedule");
    expect(HEALTH_DIMENSIONS).toHaveLength(4);
  });
});

describe("riskQueries topActionableSignals", () => {
  it("returns [] when nothing is medium or worse", () => {
    expect(topActionableSignals([sig("rfi_lag", "low")])).toEqual([]);
  });

  it("keeps only medium+ and orders high before medium", () => {
    const out = topActionableSignals([
      sig("rfi_lag", "medium"), sig("budget_burn", "high"), sig("schedule_slip", "low"),
    ]);
    expect(out.map(s => s.code)).toEqual(["budget_burn", "rfi_lag"]);
  });

  it("defaults to a 3-item cap and respects custom limits", () => {
    const many = [
      sig("a", "high"), sig("b", "high"), sig("c", "high"), sig("d", "high"),
    ];
    expect(topActionableSignals(many)).toHaveLength(3);
    expect(topActionableSignals(many, 2)).toHaveLength(2);
    expect(topActionableSignals(many, 0)).toEqual([]);
  });

  it("preserves input order within equal severity", () => {
    const out = topActionableSignals([sig("b", "medium"), sig("a", "medium")]);
    expect(out.map(s => s.code)).toEqual(["b", "a"]);
  });
});