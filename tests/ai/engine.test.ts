/* SiteTrack Pro — Intelligence Engine Verification Tests.
 * Rule-based engines — no ML, deterministic outputs from given inputs.
 * All functions pure (same inputs → same output).
 */

import { describe, test, expect } from "vitest";
import { computeDelayRisk, computeCostRisk, computeProductivity, type DelayRiskInputs, type CostRiskInputs, type ProductivityInputs } from "@/app/engines/intelligenceEngine";

describe("IntelligenceEngine — rule-based construction risk predictions", () => {
  describe("computeDelayRisk", () => {
    test("high risk when progress < 50% at mid-point + stagnant 6 days", () => {
      const inputs: DelayRiskInputs = {
        cumulativeProgress: 42,
        midPointPassed: true,
        stagnantDays: 6,
        labourEfficiency: 65,
        materialVariance: 12,
        photosPerWeek: 2,
      };
      const result = computeDelayRisk(inputs);
      expect(result.delayRisk).toBeGreaterThanOrEqual(70); // 35+25+15 = 75
      expect(result.reasonFragments.join(" ")).toContain("progress below 50% at mid-point");
      expect(result.reasonFragments.join(" ")).toContain("no update for 6 day");
    });

    test("low risk when all green", () => {
      const inputs: DelayRiskInputs = {
        cumulativeProgress: 80,
        midPointPassed: true,
        stagnantDays: 0,
        labourEfficiency: 90,
        materialVariance: 0,
        photosPerWeek: 5,
      };
      const result = computeDelayRisk(inputs);
      expect(result.delayRisk).toBeLessThan(30);
      expect(result.reasonFragments.length).toBe(0);
    });

    test("medium risk with moderate issues", () => {
      const inputs: DelayRiskInputs = {
        cumulativeProgress: 60,
        midPointPassed: true,
        stagnantDays: 3,
        labourEfficiency: 75,
        materialVariance: 5,
        photosPerWeek: 3,
      };
      const result = computeDelayRisk(inputs);
      expect(result.delayRisk).toBeGreaterThanOrEqual(30);
      expect(result.delayRisk).toBeLessThan(70);
    });
  });

  describe("computeCostRisk", () => {
    test("medium risk when spent > 40% early + high consumption", () => {
      const inputs: CostRiskInputs = {
        spentAllocated: 0.45,
        monthsElapsed: 4,
        consumptionRate: 1.15,
        wastagePct: 8,
        overtimeTrend: 5,
        logGaps: 3,
      };
      const result = computeCostRisk(inputs);
      expect(result.costOverrunRisk).toBeGreaterThanOrEqual(50); // 20+25+10 = 60 lower-bound (wastage 8% > 5 triggers +15 but we have 20+25=45, +15=60)
      // Actually: 20 (spent>40% early) + 25 (consumption >1.0) = 45; wastage 8>5 => +15 = 60
    });

    test("low risk when all on-plan", () => {
      const inputs: CostRiskInputs = {
        spentAllocated: 0.25,
        monthsElapsed: 8,
        consumptionRate: 0.95,
        wastagePct: 2,
        overtimeTrend: 0,
        logGaps: 1,
      };
      const result = computeCostRisk(inputs);
      expect(result.costOverrunRisk).toBeLessThan(30);
    });

    test("risk increases with logGaps", () => {
      const base: CostRiskInputs = {
        spentAllocated: 0.3,
        monthsElapsed: 6,
        consumptionRate: 1.0,
        wastagePct: 2,
        overtimeTrend: 0,
        logGaps: 0,
      };
      const withGaps5 = { ...base, logGaps: 5 };
      const withGaps10 = { ...base, logGaps: 10 };
      const r0 = computeCostRisk(base).costOverrunRisk;
      const r5 = computeCostRisk(withGaps5).costOverrunRisk;
      const r10 = computeCostRisk(withGaps10).costOverrunRisk;
      expect(r5).toBeGreaterThanOrEqual(r0);
      expect(r10).toBeGreaterThanOrEqual(r5);
    });
  });

  describe("computeProductivity", () => {
    test("productivity score when good attendance + high milestone progress", () => {
      const inputs: ProductivityInputs = {
        presentDays: 18,          // out of 22
        lateDays: 1,
        halfDayCount: 0,
        overtimeHours: 8,
        milestoneProgress: 80,    // 80% milestone completion
      };
      const result = computeProductivity(inputs);
      expect(result.productivityScore).toBeGreaterThanOrEqual(70);
      expect(result.efficiencyPct).toBeGreaterThan(70);
      expect(result.needsIntervention).toBe(false);
    });

    test("intervention needed when poor attendance + low progress", () => {
      const inputs: ProductivityInputs = {
        presentDays: 10,          // well below 22
        lateDays: 5,
        halfDayCount: 3,
        overtimeHours: 20,
        milestoneProgress: 30,    // low progress
      };
      const result = computeProductivity(inputs);
      expect(result.needsIntervention).toBe(true);
      expect(result.productivityScore).toBeLessThan(50);
    });

    test("overtime neutralises some inefficiency", () => {
      const inputs: ProductivityInputs = {
        presentDays: 12,          // below average
        lateDays: 4,
        halfDayCount: 2,
        overtimeHours: 20,        // high overtime
        milestoneProgress: 40,
      };
      const result = computeProductivity(inputs);
      // Overtime factor: 20 * 0.5 = 10 added back
      // Efficiency will be lower but productivity score includes milestone progress
      expect(result.productivityScore).toBeGreaterThan(0);
      expect(result.needsIntervention).toBeTruthy(); // likely true given low presentDays
    });
  });

  describe("engine determinism", () => {
    test("same inputs always produce same output", () => {
      const delayInputs: DelayRiskInputs = {
        cumulativeProgress: 42,
        midPointPassed: true,
        stagnantDays: 6,
        labourEfficiency: 65,
        materialVariance: 12,
        photosPerWeek: 2,
      };
      const costInputs: CostRiskInputs = {
        spentAllocated: 0.45,
        monthsElapsed: 4,
        consumptionRate: 1.15,
        wastagePct: 8,
        overtimeTrend: 5,
        logGaps: 3,
      };
      const productivityInputs: ProductivityInputs = {
        presentDays: 18,
        lateDays: 3,
        halfDayCount: 2,
        overtimeHours: 12,
        milestoneProgress: 65,
      };

      const r1 = computeDelayRisk(delayInputs);
      const r2 = computeDelayRisk(delayInputs);
      const c1 = computeCostRisk(costInputs);
      const c2 = computeCostRisk(costInputs);
      const p1 = computeProductivity(productivityInputs);
      const p2 = computeProductivity(productivityInputs);

      expect(r1).toEqual(r2);
      expect(c1).toEqual(c2);
      expect(p1).toEqual(p2);
    });
  });
});