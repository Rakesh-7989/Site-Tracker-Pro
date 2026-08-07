// SiteTrack Pro — deterministic project risk / delay analytics (v4 Phase D).
// No external AI: computes schedule-slip, budget-burn, open-severity-issue and
// RFI-lag signals from normalized inputs, then folds them into a 0–100 risk
// score + a delay probability. Pure + testable (takes `today` explicitly).

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskSignal {
  /** stable code (ui + tests reference these). */
  code: string;
  /** per-signal contribution tier. */
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
}

export interface RiskInput {
  /** Milestones: pending/in_progress with a past due date drive slip. */
  milestones?: { status: "pending" | "in_progress" | "completed"; dueDate: string | null }[];
  /** Budget spend vs allocated (numbers, not ₹). Omit when no budget tracked. */
  budget?: { allocated: number; spent: number } | null;
  /** Open issues; high severity weighs more. */
  openIssues?: { severity: "high" | "medium" | "low" }[];
  /** RFIs; open/overdue RFIs older than LAG_DAYS count as lagging. */
  rfiLagDays?: number;
  /** partial input is allowed — each present dimension contributes only if it has a signal. */
  rfis?: { status: "open" | "answered" | "closed" | "overdue"; askedAt: string | null }[];
}

export interface RiskResult {
  score: number;              // 0–100
  level: RiskLevel;
  signals: RiskSignal[];
  delayProbability: number;   // 0–1
  /** estimated extra days (best-effort from slip capture). */
  delayDays: number;
}

const SLIP_DAYS = 3;        // days past due before a pending milestone = slip
const HIGH_BURN = 0.8;      // spent/allocated above → budget signal
const OVER_BURN = 1.0;
const LAG_DAYS = 3;         // open RFI older than this → lag

/** Day difference (d1 − d2) in whole days for ISO date strings. */
function diffDays(a: string, b: string): number {
  const A = new Date(a + "T00:00:00Z").getTime();
  const B = new Date(b + "T00:00:00Z").getTime();
  return Math.round((A - B) / 86_400_000);
}

/** Clamp + floor a 0–100 score into a level band. */
export function riskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 25) return "medium";
  return "low";
}

/**
 * Fold milestone/budget/issue/RFI data into risk signals + score.
 * Deterministic: same inputs + same `today` → identical output.
 */
export function computeRiskSignals(input: RiskInput, today: string): RiskResult {
  const signals: RiskSignal[] = [];
  let delayDays = 0;

  // ── Schedule slip (milestones overdue) ───────────────────────────────────
  const overdue = (input.milestones ?? []).filter(m =>
    m.status !== "completed" && m.dueDate &&
    diffDays(today, m.dueDate) >= SLIP_DAYS,
  );
  if (overdue.length > 0) {
    const maxLate = Math.max(...overdue.map(m => diffDays(today, m.dueDate!)));
    delayDays = Math.max(delayDays, maxLate);
    signals.push({
      code: "schedule_slip",
      severity: maxLate >= 14 ? "high" : "medium",
      title: `${overdue.length} milestone${overdue.length > 1 ? "s" : ""} past due`,
      detail: `Latest is ${maxLate} days overdue.`,
    });
  }

  // --- Budget burn (spend vs allocated) ─────────────────────────────────────
  const b = input.budget;
  if (b && b.allocated > 0) {
    const burn = b.spent / b.allocated;
    if (burn >= OVER_BURN) {
      signals.push({
        code: "budget_overrun",
        severity: "high",
        title: "Budget spent",
        detail: `Spend is ${Math.round(burn * 100)}% of the plan.`,
      });
    } else if (burn >= HIGH_BURN) {
      signals.push({
        code: "budget_burn",
        severity: "medium",
        title: `${Math.round(burn * 100)}% budget consumed`,
        detail: "Remaining budget is running low for the scope left.",
      });
    }
  }

  // ── Open high-severity issues ─────────────────────────────────────────────
  const openHigh = (input.openIssues ?? []).filter(i => i.severity === "high");
  if (openHigh.length > 0) {
    signals.push({
      code: "high_severity_issues",
      severity: openHigh.length >= 3 ? "high" : "medium",
      title: `${openHigh.length} open high-severity ${openHigh.length > 1 ? "issues" : "issue"}`,
      detail: "Blocking defects are unresolved.",
    });
  }

  // ── RFI lag ─────────────────────────────────────────────────────────────
  const lagging = (input.rfis ?? []).filter(r => {
    if (r.status !== "open" && r.status !== "overdue") return false;
    return !!r.askedAt && diffDays(today, r.askedAt.slice(0, 10)) >= LAG_DAYS;
  });
  if (lagging.length > 0) {
    signals.push({
      code: "rfi_lag",
      severity: lagging.length >= 4 ? "high" : "medium",
      title: `${lagging.length} RFI${lagging.length > 1 ? "s" : ""} awaiting response`,
      detail: `Unanswered for ${LAG_DAYS}+ days.`,
    });
  }

  // ── Fold → score + probability (weighted, 0–100). ───────────────────────
  if (signals.length === 0) {
    return { score: 0, level: "low", signals, delayProbability: 0, delayDays };
  }
  let weight = 0;
  for (const s of signals) {
    if (s.severity === "high") weight += 34;
    else if (s.severity === "medium") weight += 20;
    else weight += 10;
  }
  const score = Math.min(100, Math.round(weight));
  const level = riskLevel(score);
  const delayProbability = Math.min(0.9, score / 100);
  return { score, level, signals, delayProbability, delayDays };
}