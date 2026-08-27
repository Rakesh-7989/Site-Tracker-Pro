/* SiteTrack Pro — AI chat assistant: structured intent parser (v5 Phase 1).
 * No external AI: parses user messages into typed intents + slots,
 * then dispatches to pure deterministic functions from riskQueries.
 * Responses use design-system tokens (--st-*) and i18n labels.
 */

import { computeRiskSignals, predictStockOut, computeProductivity, type RiskInput, type RiskResult } from "../queries/riskQueries";

export type IntentCategory =
  | "delay_forecast"
  | "cost_forecast"
  | "material_stock"
  | "productivity_report"
  | "risk_summary";

export interface IntentSlot {
  name: string;
  value: string | number | boolean;
}

export interface ParsedIntent {
  category: IntentCategory;
  confidence: number; // 0–1, higher = more certain
  originalText: string;
  slots: IntentSlot[];
}

/** Extract intent + slots from a user message.
 *  Uses keyword matching + simple heuristics; no ML required.
 */
export function parseIntent(text: string): ParsedIntent {
  const lowered = text.toLowerCase().trim();
  const slots: IntentSlot[] = [];

  // --- Detect category ---
  let category: IntentCategory = "risk_summary";
  let confidence = 0.5;

  if (
    lowered.includes("delay") ||
    lowered.includes("slip") ||
    lowered.includes("late milestone") ||
    lowered.includes("behind schedule")
  ) {
    category = "delay_forecast";
    confidence = 0.9;
    if (lowered.includes("project")) slots.push({ name: "project_id", value: "current" });
    if (/(\d+)\s*day/.test(lowered)) {
      const m = lowered.match(/(\d+)\s*day/);
      if (m) slots.push({ name: "days", value: Number(m[1]) });
    }
  } else if (
    lowered.includes("cost") ||
    lowered.includes("budget") ||
    lowered.includes("forecast") ||
    lowered.includes("spend") ||
    lowered.includes("burn")
  ) {
    category = "cost_forecast";
    confidence = 0.85;
    if (lowered.includes("project")) slots.push({ name: "project_id", value: "current" });
    if (lowered.includes("month")) slots.push({ name: "period", value: "month" });
  } else if (
    lowered.includes("stock") ||
    lowered.includes("material") ||
    lowered.includes("inventory") ||
    lowered.includes("running out")
  ) {
    category = "material_stock";
    confidence = 0.8;
    if (lowered.includes("project")) slots.push({ name: "project_id", value: "current" });
    if (lowered.includes("item")) slots.push({ name: "item", value: "general" });
    if (/\d+\s*q/.test(lowered) || /quantity/.test(lowered)) {
      slots.push({ name: "quantity", value: "parseable" });
    }
  } else if (
    lowered.includes("productivity") ||
    lowered.includes("efficiency") ||
    lowered.includes("labour") ||
    lowered.includes("labor") ||
    lowered.includes("team performance")
  ) {
    category = "productivity_report";
    confidence = 0.85;
    if (lowered.includes("project")) slots.push({ name: "project_id", value: "current" });
  }

  // --- Fill generic slots ---
  if (lowered.includes("this")) slots.push({ name: "reference", value: "current" });
  if (lowered.includes("our")) slots.push({ name: "ownership", value: "org" });

  return {
    category,
    confidence,
    originalText: text,
    slots,
  };
}

/** Dispatch a parsed intent to the appropriate pure function,
 *  and generate a human-readable response using design-system tokens.
 */
export async function respondToIntent(
  intent: ParsedIntent,
): Promise<string> {
  const { category, slots } = intent;
  const t = (s: string) => s; // i18n placeholder — replace with useT() in UI

  // Helper to build a risk input from slots
  const buildRiskInput = (): RiskInput => {
    const base: RiskInput = {};
    if (slots.some(s => s.name === "project_id")) {
      base.milestones = [];
      base.budget = { allocated: 1_000_000, spent: 450_000 };
      base.openIssues = [];
      base.rfis = [];
    }
    return base;
  };

  switch (category) {
    case "delay_forecast": {
      const days = Number(slots.find(s => s.name === "days")?.value ?? 7);
      const input: RiskInput = {
        milestones: [
          { status: "in_progress", dueDate: new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) },
        ],
        budget: { allocated: 1_000_000, spent: 600_000 },
        openIssues: [],
        rfis: [],
      };
      const result: RiskResult = computeRiskSignals(input, new Date().toISOString().slice(0, 10));

      const delayDays = result.delayDays;
      const delayProb = Math.round(result.delayProbability * 100);
      const level = result.level;

      let detail = `Delay probability is ${delayProb}%. `;
      if (delayDays > 0) {
        detail += `Latest milestone is ${delayDays} days overdue. `;
      }
      detail += `Risk level: <span class="st-${level === "critical" ? "danger" : level === "high" ? "warning" : "neutral"}">${t(
        level,
      )}</span>. `;

      if (days <= delayDays) {
        detail += `⚠️ Your ${days}-day threshold is already exceeded. `;
      }
      detail += `Suggested actions: re-prioritize backlog, add resources, or adjust milestones.`;

      return `📅 **Delay forecast**: ${detail}`;
    }

    case "cost_forecast": {
      const input: RiskInput = buildRiskInput();
      const result: RiskResult = computeRiskSignals(input, new Date().toISOString().slice(0, 10));

      const projected = result.costForecast?.projected ?? 0;
      const variance = result.costForecast?.variance ?? Math.round(projected * 0.2);
      const confidencePct = Math.round((result.costForecast?.confidence ?? 0) * 100);

      const detail = `₹${projected.toLocaleString()} projected cost over remaining months (${confidencePct}% confidence, ±₹${variance.toLocaleString()} variance). `;
      const burnNote = result.burnAccelerating ? "⚠️ Budget burn is accelerating — consider re-evaluating scope." : "";
      return `💰 **Cost forecast**: ${detail}${burnNote}`;
    }

    case "material_stock": {
      // Default material params if not specified
      const consumption = 50; // qty per month
      const stock = 200; // current stock
      const leadDays = 14; // supplier lead time

      const { stockOutDays, stockOutCritical } = predictStockOut(consumption, stock, leadDays);

      let detail = `Stock will last ~${stockOutDays} days (lead time ${leadDays}d included). `;
      if (stockOutCritical) {
        detail += "🚨 **Critical**: stock-out risk within 14 days. Immediate reorder recommended. ";
      } else {
        detail += "✅ Stock levels are healthy for now. ";
      }
      detail += `Suggested reorder point: ${Math.max(1, stock - consumption * 7)} units.`;

      return `📦 **Material stock**: ${detail}`;
    }

    case "productivity_report": {
      // Default productivity inputs (realistic project scenario)
      const presentDays = 18; // out of 22
      const onSiteLateDays = 3;
      const halfDayCount = 2;
      const overtimeHours = 12;
      const milestoneProgress = 65; // 65%

      const { productivityScore, efficiencyPct, needsIntervention } = computeProductivity(
        presentDays,
        onSiteLateDays,
        halfDayCount,
        overtimeHours,
        milestoneProgress,
      );

      const scoreStr = productivityScore.toString();
      const effStr = efficiencyPct.toFixed(1);
      const interventionNote = needsIntervention
        ? "🚨 **Intervention recommended** — efficiency is below target. "
        : "✅ Productivity is on track. ";

      const detail = `Productivity score: <strong>${scoreStr}/100</strong> | Efficiency: ${effStr}% `;
      return `📊 **Productivity report**: ${detail}${interventionNote}Next steps: address attendance patterns, reduce late arrivals, or accelerate milestone delivery.`;
    }

    case "risk_summary": {
      const input: RiskInput = buildRiskInput();
      const result: RiskResult = computeRiskSignals(input, new Date().toISOString().slice(0, 10));

      const lines: string[] = [];
      if (result.signals.length > 0) {
        lines.push(`**Signals (${result.signals.length})**:`);
        for (const s of result.signals) {
          const tone = s.severity === "high" ? "danger" : s.severity === "medium" ? "warning" : "neutral";
          lines.push(`• <span class="st-${tone}">${s.code.replace(/_/g, " ")}</span>: ${s.title}`);
        }
      } else {
        lines.push("✅ No active risk signals detected.");
      }
      lines.push(`**Risk level**: <span class="st-${result.level}">${result.level}</span>`);
      lines.push(`**Delay probability**: ${Math.round(result.delayProbability * 100)}%`);
      lines.push(`**Cost forecast**: ₹${result.costForecast?.projected?.toLocaleString() ?? 0} (${Math.round((result.costForecast?.confidence ?? 0) * 100)}% confidence)`);
      lines.push(`**Burn accelerating**: ${result.burnAccelerating ? "Yes" : "No"}`);

      return `🛡️ **Risk summary**:\n` + lines.join("\n");
    }

    default:
      return `I didn't understand that request. Try: "delay forecast for this project", "cost forecast", "material stock check", "productivity report", or "risk summary".`;
  }
}

/** Example usage (to be wired into the chat component):
 *  const parsed = parseIntent(userMessage);
 *  const response = await respondToIntent(parsed);
 *  setChatResponse(response);
 */