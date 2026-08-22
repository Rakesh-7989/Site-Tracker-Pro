/* SiteTrack Pro — Construction Intelligence Engine (v5 Phase 1).
 * Pure rule-based predictions from site data — no ML training required.
 * Inputs: minimal mobile update data; Outputs: 3 risk scores + productivity.
 * All functions are deterministic and testable.
 */

/** Input shape for delay risk engine. */
export interface DelayRiskInputs {
  cumulativeProgress: number;    // 0-100 % progress
  midPointPassed: boolean;       // has project passed its halfway timeline?
  stagnantDays: number;          // days with no progress update
  labourEfficiency: number;      // % (present_days / max_days * 100)
  materialVariance: number;      // % over/under plan (e.g. 12 = 12% over)
  photosPerWeek: number;         // count of photo updates per week
}

/** Output of delay risk engine. */
export interface DelayRiskOutput {
  delayRisk: number;             // 0-100, higher = higher risk of delay
  reasonFragments: string[];     // human-readable reasons
}

/** Compute delay risk from site update data (rule-based, no ML). */
export function computeDelayRisk(inputs: DelayRiskInputs): DelayRiskOutput {
  let risk = 0;
  const fragments: string[] = [];

  // Rule 1: Progress < 50% by mid-point → significant risk
  if (inputs.cumulativeProgress < 50 && inputs.midPointPassed) {
    risk += 35;
    fragments.push("progress below 50% at mid-point");
  } else if (inputs.cumulativeProgress < 75 && inputs.midPointPassed) {
    // Rule 1b: behind pace at mid-point → moderate risk
    risk += 20;
    fragments.push("behind pace at mid-point");
  }

  // Rule 2: Stagnant for 5+ days → high raise; 3+ days → moderate
  if (inputs.stagnantDays >= 5) {
    risk += 25;
    fragments.push(`no update for ${inputs.stagnantDays} day${inputs.stagnantDays > 1 ? "s" : ""}`);
  } else if (inputs.stagnantDays >= 3) {
    risk += 10;
    fragments.push(`no update for ${inputs.stagnantDays} day${inputs.stagnantDays > 1 ? "s" : ""}`);
  }

  // Rule 3: Labour efficiency < 70% → high raise; < 85% → moderate
  if (inputs.labourEfficiency < 70) {
    risk += 20;
    fragments.push(`labour efficiency ${inputs.labourEfficiency}% below target`);
  } else if (inputs.labourEfficiency < 85) {
    risk += 10;
    fragments.push(`labour efficiency ${inputs.labourEfficiency}% below target`);
  }

  // Rule 4: Material consumption > 10% over plan → raise risk
  if (inputs.materialVariance > 10) {
    risk += 15;
    fragments.push(`material variance +${inputs.materialVariance}% over plan`);
  }

  // Rule 5: Few photos uploaded → raise risk
  if (inputs.photosPerWeek < 3) {
    risk += 10;
    fragments.push(`only ${inputs.photosPerWeek} photo${inputs.photosPerWeek !== 1 ? "s" : ""} per week`);
  }

  return {
    delayRisk: Math.min(100, risk),
    reasonFragments: fragments,
  };
}

/** Input shape for cost overrun risk engine. */
export interface CostRiskInputs {
  spentAllocated: number;        // spent / allocated ratio (0-1)
  monthsElapsed: number;         // months project has been running
  consumptionRate: number;       // actual vs planned consumption (1.0 = on plan)
  wastagePct: number;            // material wastage percentage (e.g. 8 = 8%)
  overtimeTrend: number;         // overtime hours change vs previous period (Δ)
  logGaps: number;               // days without any update/log entry
}

/** Output of cost risk engine. */
export interface CostRiskOutput {
  costOverrunRisk: number;       // 0-100, higher = higher risk of overrunning budget
  reasonFragments: string[];     // human-readable reasons
}

/** Compute cost overrun risk from site update data (rule-based). */
export function computeCostRisk(inputs: CostRiskInputs): CostRiskOutput {
  let risk = 0;
  const fragments: string[] = [];

  // Rule 1: Spent > 40% of budget early (before 6 months) → medium risk
  if (inputs.spentAllocated > 0.4 && inputs.monthsElapsed < 6) {
    risk += 20;
    fragments.push("spent 40%+ of budget in early stage");
  }

  // Rule 2: Consumption rate > plan → raise risk
  if (inputs.consumptionRate > 1.0) {
    risk += 25;
    fragments.push(`consumption ${(inputs.consumptionRate * 100).toFixed(0)}% over plan`);
  }

  // Rule 3: Material wastage > 5% → raise risk
  if (inputs.wastagePct > 5) {
    risk += 15;
    fragments.push(`wastage ${inputs.wastagePct}% above acceptable`);
  }

  // Rule 3: Overtime hours increasing → raise risk
  if (inputs.overtimeTrend > 0) {
    risk += 10;
    fragments.push(`overtime trend increasing (${inputs.overtimeTrend}+ hrs)`);
  }

  // Rule 4: No logs/updates for 5+ days → raise risk
  if (inputs.logGaps >= 5) {
    risk += 15;
    fragments.push(`no update/log for ${inputs.logGaps} day${inputs.logGaps > 1 ? "s" : ""}`);
  }

  return {
    costOverrunRisk: Math.min(100, risk),
    reasonFragments: fragments,
  };
}

/** Input shape for productivity engine. */
export interface ProductivityInputs {
  presentDays: number;           // days worker was present (out of 22 work days)
  lateDays: number;              // days arrived late
  halfDayCount: number;          // number of half-day occurrences
  overtimeHours: number;         // overtime hours logged
  milestoneProgress: number;     // 0-100 % milestone completion
}

/** Output of productivity engine. */
export interface ProductivityOutput {
  productivityScore: number;     // 0-100 (weighted: 60% efficiency + 40% progress)
  efficiencyPct: number;         // 0-100 % base efficiency after penalties
  needsIntervention: boolean;    // true if score < 50 or efficiency < 40
}

/** Compute labour productivity score (rule-based, no ML). */
export function computeProductivity(inputs: ProductivityInputs): ProductivityOutput {
  // Base efficiency: present days vs total possible (assume 22 work days/month)
  const maxPresent = 22;
  const attendanceEfficiency = Math.min(1, inputs.presentDays / Math.max(1, maxPresent)) * 100;

  // Late days penalty: each late day reduces efficiency by 3% (capped at 30%)
  const latePenalty = Math.min(30, inputs.lateDays * 3);

  // Half-day penalty: each half-day reduces efficiency by 5% (capped at 25%)
  const halfDayPenalty = Math.min(25, inputs.halfDayCount * 5);

  // Overtime is neutral (extra effort offsets some inefficiency)
  const overtimeFactor = Math.max(0, Math.min(10, inputs.overtimeHours * 0.5));

  // Overall efficiency starts from attendance, minus penalties, plus OT offset
  const efficiencyPct = Math.max(0, Math.min(100,
    attendanceEfficiency - latePenalty - halfDayPenalty + overtimeFactor));

  // Productivity score: 60% efficiency + 40% milestone progress
  const productivityScore = Math.round((efficiencyPct * 0.6) + (inputs.milestoneProgress * 0.4));

  // Needs intervention if productivity < 50 or efficiency < 40
  const needsIntervention = productivityScore < 50 || efficiencyPct < 40;

  return {
    productivityScore,
    efficiencyPct,
    needsIntervention,
  };
}

/** Main intelligence bundle — compute all 3 risk scores + productivity. */
export interface IntelligenceBundle {
  delayRisk: DelayRiskOutput;
  costRisk: CostRiskOutput;
  productivity: ProductivityOutput;
}

/** Compute all intelligence from a single site update record. */
export function computeIntelligence(
  delayInputs: DelayRiskInputs,
  costInputs: CostRiskInputs,
  productivityInputs: ProductivityInputs,
): IntelligenceBundle {
  return {
    delayRisk: computeDelayRisk(delayInputs),
    costRisk: computeCostRisk(costInputs),
    productivity: computeProductivity(productivityInputs),
  };
}

/** Example usage (to be wired into mobile update flow):
 *  const delayInputs: DelayRiskInputs = {
 *    cumulativeProgress: 42,
 *    midPointPassed: true,
 *    stagnantDays: 6,
 *    labourEfficiency: 65,
 *    materialVariance: 12,
 *    photosPerWeek: 2,
 *  };
 *  const costInputs: CostRiskInputs = {
 *    spentAllocated: 0.42,
 *    monthsElapsed: 4,
 *    consumptionRate: 1.12,
 *    wastagePct: 8,
 *    overtimeTrend: 3,
 *    logGaps: 3,
 *  };
 *  const productivityInputs: ProductivityInputs = {
 *    presentDays: 18,
 *    lateDays: 3,
 *    halfDayCount: 2,
 *    overtimeHours: 12,
 *    milestoneProgress: 65,
 *  };
 *  const bundle = computeIntelligence(delayInputs, costInputs, productivityInputs);
 *  // bundle.delayRisk.delayRisk → 67
 *  // bundle.costRisk.costOverrunRisk → 45
 *  // bundle.productivity.productivityScore → 68
 */