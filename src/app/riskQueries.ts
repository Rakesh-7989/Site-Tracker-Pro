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
  /** cost forecast for remaining spend to completion (₹, ± 20% variance, confidence 0–1). */
  costForecast: { projected: number; variance: number; confidence: number };
  /** flag: burning ≥80% of plan while scope remains open. */
  burnAccelerating: boolean;
  /** stock-out risk: days until critical stock level for project items. */
  stockOutDays: number;
  /** flag: any project item at risk of stock-out within 14 days. */
  stockOutCritical: boolean;
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

/** Predict stock-out risk for project materials.
 *  Consumption: qty per month per item; leadDays: supplier lead time in days.
 *  Returns days until critical stock, and whether any item is critical within 14 days.
 */
export function predictStockOut(
  consumptionPerMonth: number,
  currentStock: number,
  leadDays: number
): { stockOutDays: number; stockOutCritical: boolean } {
  if (consumptionPerMonth <= 0 || currentStock <= 0 || leadDays < 0) {
    return { stockOutDays: 0, stockOutCritical: false };
  }
  // Monthly consumption rate
  const monthlyRate = consumptionPerMonth;
  // Days current stock will last
  const daysStockLasts = (currentStock / monthlyRate) * 30;
  // Total days until stock-out = days stock lasts + lead time to reorder
  const stockOutDays = Math.round(daysStockLasts + leadDays);
  // Critical if stock-out within 14 days from now (including lead time)
  const stockOutCritical = stockOutDays <= 14;
  return { stockOutDays, stockOutCritical };
}

/** Compute labour productivity score for a project.
 *  Attendance: present days, on_site_late days, half_day days, overtime hours.
 *  Progress: milestone completion % (0–100).
 *  Returns productivity score 0–100, efficiency %, and flag for intervention.
 */
export function computeProductivity(
  presentDays: number,
  onSiteLateDays: number,
  halfDayCount: number,
  overtimeHours: number,
  milestoneProgress: number,   // 0–100 %
): { productivityScore: number; efficiencyPct: number; needsIntervention: boolean } {
  if (presentDays < 0 || milestoneProgress < 0) {
    return { productivityScore: 0, efficiencyPct: 0, needsIntervention: false };
  }
  // Base efficiency: present days vs total possible (assume 22 work days/month)
  const maxPresent = 22;
  const attendanceEfficiency = Math.min(1, presentDays / Math.max(1, maxPresent)) * 100;
  // Late days penalty: each late day reduces efficiency by 3%
  const latePenalty = Math.min(30, onSiteLateDays * 3);
  // Half-day penalty: each half-day reduces by 5%
  const halfDayPenalty = Math.min(25, halfDayCount * 5);
  // Overtime is neutral (extra effort offsets some inefficiency)
  const overtimeFactor = Math.max(0, Math.min(10, overtimeHours * 0.5));
  // Overall efficiency starts from attendance, minus penalties, plus OT offset
  const efficiencyPct = Math.max(0, Math.min(100,
    attendanceEfficiency - latePenalty - halfDayPenalty + overtimeFactor));
  // Productivity score folds in milestone/progress delivery
  const productivityScore = Math.round((efficiencyPct * 0.6) + (milestoneProgress * 0.4));
  // Needs intervention if productivity < 50 or efficiency < 40
  const needsIntervention = productivityScore < 50 || efficiencyPct < 40;
  // Cap score at 100 (defensive: milestoneProgress may exceed 100)
  const cappedScore = Math.min(100, productivityScore);
  return { productivityScore: cappedScore, efficiencyPct, needsIntervention };
}

/**
 * Fold milestone/budget/issue/RFI data into risk signals + score.
 * Deterministic: same inputs + same `today` → identical output.
 */
export function computeRiskSignals(input: RiskInput, today: string): RiskResult {
  const signals: RiskSignal[] = [];
  let delayDays = 0;
  let burnAccelerating = false;

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

  // ── Cost forecast (remaining spend to completion, linear assumption) ──────
  let projectedCost = 0;
  let confidence = 0;
  if (b && b.allocated > 0 && b.spent > 0) {
    const currentBurn = b.spent / b.allocated;
    // Remaining budget the project still has to consume to finish (linear scope).
    projectedCost = Math.max(0, b.allocated - b.spent);
    // Confidence falls as actual burn approaches/exceeds plan.
    confidence = Math.max(0, Math.min(1, OVER_BURN - currentBurn));
    // Acceleration proxy: burning ≥80% of plan while scope remains open.
    if (currentBurn >= HIGH_BURN && currentBurn < OVER_BURN) {
      burnAccelerating = true;
    }
  }

  // ── Fold → score + probability (weighted, 0–100). ───────────────────────
  if (signals.length === 0) {
    return {
      score: 0, level: "low", signals, delayProbability: 0, delayDays,
      costForecast: { projected: projectedCost, variance: Math.round(projectedCost * 0.2), confidence },
      burnAccelerating,
      stockOutDays: 0,
      stockOutCritical: false,
    };
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
  return {
    score, level, signals, delayProbability, delayDays,
    costForecast: { projected: projectedCost, variance: Math.round(projectedCost * 0.2), confidence },
    burnAccelerating,
    stockOutDays: 0,
    stockOutCritical: false,
  };
}

// ── Stored nightly snapshot (project_risk_signals — migrations 225/226) ─────
// The pg_cron job `compute-risk-signals` persists per-project rows nightly.
// Read-side helpers below let the UI card prefer a fresh server snapshot and
// fall back to on-the-fly computeRiskSignals() when none exists.

export interface StoredRiskSignal {
  code: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
}

export interface StoredRiskSnapshot {
  projectId: string;
  score: number;
  level: RiskLevel;
  delayProbability: number;
  delayDays: number;
  burnAccelerating: boolean;
  signals: StoredRiskSignal[];
  computedAt: string; // ISO timestamp of the nightly run
}

/** Cron fires daily at 02:05 UTC — snapshots older than this are stale. */
export const RISK_SNAPSHOT_MAX_AGE_HOURS = 26;

/** Pure freshness check (cron cadence + slack). */
export function isSnapshotFresh(snap: StoredRiskSnapshot, now: Date = new Date()): boolean {
  const t = Date.parse(snap.computedAt);
  if (Number.isNaN(t)) return false;
  return (now.getTime() - t) / 3_600_000 <= RISK_SNAPSHOT_MAX_AGE_HOURS;
}

type RiskSignalsRow = {
  project_id: string;
  risk_score: number | null;
  risk_level: string | null;
  delay_probability: number | string | null;
  delay_days: number | null;
  burn_accelerating: boolean | null;
  signals: unknown;
  updated_at: string | null;
};

/** Map a raw DB row to the snapshot shape; null when unrecognizable. */
export function mapRiskSignalsRow(row: RiskSignalsRow): StoredRiskSnapshot | null {
  if (!row || typeof row.project_id !== "string") return null;
  const level = riskLevel(Number(row.risk_score ?? 0));
  let signals: StoredRiskSignal[] = [];
  if (Array.isArray(row.signals)) {
    signals = row.signals
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map(s => ({
        code: typeof s.code === "string" ? s.code : "unknown",
        severity: s.severity === "high" ? "high" : s.severity === "medium" ? "medium" : "low",
        title: typeof s.title === "string" ? s.title : "",
        detail: typeof s.detail === "string" ? s.detail : "",
      }));
  }
  return {
    projectId: row.project_id,
    score: Math.max(0, Math.min(100, Number(row.risk_score ?? 0))),
    level,
    delayProbability: Math.max(0, Math.min(0.9, Number(row.delay_probability ?? 0))),
    delayDays: Math.max(0, Number(row.delay_days ?? 0)),
    burnAccelerating: row.burn_accelerating === true,
    signals,
    computedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export type RiskQueryResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Fetch the persisted nightly snapshot for one project; null when absent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProjectRiskSnapshot(client: any, projectId: string): Promise<RiskQueryResult<StoredRiskSnapshot | null>> {
  try {
    const { data, error } = await client.from("project_risk_signals")
      .select("project_id,risk_score,risk_level,delay_probability,delay_days,burn_accelerating,signals,updated_at")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message ?? "risk snapshot fetch failed" };
    return { ok: true, data: data ? mapRiskSignalsRow(data as RiskSignalsRow) : null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}