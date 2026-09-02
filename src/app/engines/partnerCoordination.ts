// SiteTrack Pro — C4: cross-org partner coordination agent (pure, testable).
//
// The moat's AI layer: a partner project's deliverables are checked for
// cross-org desync — e.g. an architecture firm's pending drawings block a
// contractor's open tasks. The scorer is deterministic (no LLM) so it is
// cheap, stable and harness-friendly; an LLM summary can wrap it later.

export type CoordinationCode = "design-blocking" | "site-pileup" | "review-lag" | "idle-partner";

export interface CoordinationSignal {
  code: CoordinationCode;
  severity: "high" | "medium" | "low";
  /** Discriminates the two review-lag variants (drawings vs FF&E) for localized rendering. */
  variant?: "drawings" | "ffe";
  title: string;
  detail: string;
}

export interface CoordinationInput {
  pendingDrawings: number;
  openTasks: number;
  openIssues: number;
  pendingFfe?: number;
  daysSinceLastUpdate?: number | null;
}

export interface CoordinationResult {
  score: number; // 0–100
  signals: CoordinationSignal[];
}

/**
 * Pure scorer: folds partner lane signals into a 0–100 coordination score.
 * Weights: design-blocking 35, site-pileup 30, review-lag 20, idle-partner 15.
 * Caps at 100. Bands: low <25 < medium <45 < high <70 < critical.
 */
export function computePartnerCoordination(input: CoordinationInput): CoordinationResult {
  const signals: CoordinationSignal[] = [];
  let score = 0;

  // Design-blocking: pending drawings + open execution work
  if (input.pendingDrawings > 0 && (input.openTasks > 2 || input.openIssues > 0)) {
    const s: CoordinationSignal = {
      code: "design-blocking",
      severity: input.pendingDrawings >= 3 || input.openTasks >= 5 ? "high" : "medium",
      title: "Design review blocking site work",
      detail: `${input.pendingDrawings} drawing${input.pendingDrawings === 1 ? "" : "s"} pending · ${input.openTasks} open tasks · ${input.openIssues} open issues`,
    };
    signals.push(s);
    score += s.severity === "high" ? 35 : 20;
  } else if (input.pendingDrawings > 2) {
    const s: CoordinationSignal = {
      code: "review-lag",
      variant: "drawings",
      severity: input.pendingDrawings >= 4 ? "high" : "medium",
      title: "Drawings awaiting review",
      detail: `${input.pendingDrawings} revisions pending partner or client approval`,
    };
    signals.push(s);
    score += s.severity === "high" ? 20 : 12;
  }

  // Site pile-up: many open tasks/issues without progress
  if (input.openTasks >= 5 || input.openIssues >= 4) {
    const s: CoordinationSignal = {
      code: "site-pileup",
      severity: input.openTasks >= 8 || input.openIssues >= 6 ? "high" : "medium",
      title: "Site work piling up",
      detail: `${input.openTasks} open tasks · ${input.openIssues} open issues`,
    };
    // Avoid duplicate if already added via design-blocking with same counts
    if (!signals.some(x => x.code === "site-pileup")) {
      signals.push(s);
      score += s.severity === "high" ? 30 : 18;
    }
  }

  // Idle partner: no updates in N days while work is open
  if (input.daysSinceLastUpdate != null && input.daysSinceLastUpdate > 7 && (input.openTasks > 0 || input.pendingDrawings > 0)) {
    const s: CoordinationSignal = {
      code: "idle-partner",
      severity: input.daysSinceLastUpdate > 14 ? "high" : "medium",
      title: "No recent site updates",
      detail: `No updates in ${input.daysSinceLastUpdate} days while ${input.pendingDrawings + input.openTasks + input.openIssues} items are open`,
    };
    signals.push(s);
    score += s.severity === "high" ? 15 : 8;
  }

  // FFE idle for interior firms
  if ((input.pendingFfe ?? 0) > 5) {
    const s: CoordinationSignal = {
      code: "review-lag",
      variant: "ffe",
      severity: (input.pendingFfe ?? 0) > 10 ? "high" : "low",
      title: "FF&E selections pending",
      detail: `${input.pendingFfe} FF&E items not yet installed`,
    };
    signals.push(s);
    score += s.severity === "high" ? 15 : 6;
  }

  return { score: Math.min(100, score), signals };
}

export function coordinationLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 25) return "medium";
  return "low";
}
