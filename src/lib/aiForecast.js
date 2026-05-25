// SiteTrack Pro — AI cost-overrun forecaster.
//
// Goal: from BOQ + RA bills + Ledger consumption + project timeline, predict
//   - probable cost overrun amount (₹)
//   - probable schedule slip (days)
//   - confidence band (low/medium/high)
//   - human-readable narrative ("Steel 18% over plan after column issue in B2…")
//
// Two-mode pattern (mirrors src/lib/ai.js):
//   1. Deterministic burn-rate analysis (always available, free) — pure math
//      on project state. Good baseline.
//   2. Optional LLM enrichment (Anthropic/OpenAI) — adds the narrative + nuance.
//      Configured via the same `aiCfg` localStorage settings as Insights.
//
// Public API:
//   forecastDeterministic(projectState)   → { overrun_amount, slip_days, confidence }
//   forecastWithLlm(projectState, aiCfg)  → async returns deterministic ++ narrative

import { fetchLLMInsight } from "./ai.js";

/** Deterministic forecast — pure burn-rate math, instant. */
export function forecastDeterministic(state) {
  const { project, boq = [], ra = [], ledger = [], updates = [] } = state || {};
  if (!project) return null;

  const budget = Number(project.budget) || 0;
  const billedSoFar = ra.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const progressPct = Math.max(1, Number(project.progress) || 1);
  const projectedTotal = (billedSoFar / progressPct) * 100;
  const overrun = Math.max(0, Math.round(projectedTotal - budget));

  // Schedule slip — compare days elapsed × pct-complete-curve vs days planned.
  const start = project.start_date ? new Date(project.start_date) : null;
  const expectedEnd = project.expected_end_date ? new Date(project.expected_end_date) : null;
  let slipDays = 0;
  if (start && expectedEnd) {
    const elapsed = (Date.now() - start.getTime()) / 86400000;
    const total = (expectedEnd.getTime() - start.getTime()) / 86400000;
    const expectedProgress = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const lag = expectedProgress - progressPct; // positive = behind schedule
    slipDays = Math.round((lag / 100) * total);
  }

  // Confidence — higher when we have more data points to work with.
  let confidence = "low";
  const dataPoints = ra.length + ledger.length + updates.length;
  if (dataPoints >= 25) confidence = "high";
  else if (dataPoints >= 10) confidence = "medium";

  // Material consumption signal — flag commodities consumed > BOQ planned.
  const overConsumed = detectOverConsumption(boq, ledger);

  return {
    budget,
    billed_so_far: billedSoFar,
    projected_total: Math.round(projectedTotal),
    overrun_amount: overrun,
    overrun_pct: budget ? Math.round((overrun / budget) * 100) : 0,
    schedule_slip_days: slipDays,
    confidence,
    over_consumed_materials: overConsumed,
    generated_at: new Date().toISOString(),
    mode: "deterministic",
  };
}

/**
 * LLM-enriched forecast — adds a narrative explanation on top of the math.
 * Falls back gracefully to deterministic-only if no LLM is configured.
 */
export async function forecastWithLlm(state, aiCfg) {
  const base = forecastDeterministic(state);
  if (!base) return null;
  if (!aiCfg?.provider || !aiCfg?.apiKey) {
    return { ...base, narrative: defaultNarrative(base), mode: "deterministic" };
  }
  const prompt = buildPrompt(state, base);
  try {
    const res = await fetchLLMInsight(prompt, aiCfg);
    return { ...base, narrative: res?.text || defaultNarrative(base), mode: "llm" };
  } catch (e) {
    return { ...base, narrative: defaultNarrative(base), mode: "deterministic", llm_error: String(e?.message || e) };
  }
}

function defaultNarrative(f) {
  const parts = [];
  if (f.overrun_amount > 0) {
    parts.push(`At the current burn rate, the project is on track to overshoot the budget by ₹${f.overrun_amount.toLocaleString("en-IN")} (${f.overrun_pct}%).`);
  } else {
    parts.push(`The project is currently within budget at the current burn rate.`);
  }
  if (f.schedule_slip_days > 0) {
    parts.push(`Schedule slip estimated at ${f.schedule_slip_days} day(s) — progress is trailing the planned curve.`);
  } else if (f.schedule_slip_days < 0) {
    parts.push(`Project is running ${Math.abs(f.schedule_slip_days)} day(s) ahead of plan.`);
  }
  if (f.over_consumed_materials?.length) {
    parts.push(`Materials trending over plan: ${f.over_consumed_materials.map(m => `${m.name} (+${m.over_pct}%)`).join(", ")}.`);
  }
  parts.push(`Confidence: ${f.confidence}.`);
  return parts.join(" ");
}

function detectOverConsumption(boq, ledger) {
  // Build a planned-qty map from BOQ.
  const planned = {};
  for (const item of boq || []) {
    const key = (item.description || item.code || "").toLowerCase().trim();
    if (!key) continue;
    planned[key] = (planned[key] || 0) + (Number(item.qty) || 0);
  }
  // Sum outward ledger by material name.
  const consumed = {};
  for (const row of ledger || []) {
    if (row.direction !== "outward") continue;
    const key = (row.material || "").toLowerCase().trim();
    if (!key) continue;
    consumed[key] = (consumed[key] || 0) + (Number(row.qty) || 0);
  }
  const out = [];
  for (const key of Object.keys(consumed)) {
    const plan = planned[key];
    if (!plan) continue;
    if (consumed[key] > plan * 1.05) { // 5% buffer
      out.push({
        name: key,
        planned: plan,
        consumed: consumed[key],
        over_pct: Math.round(((consumed[key] - plan) / plan) * 100),
      });
    }
  }
  return out.sort((a, b) => b.over_pct - a.over_pct).slice(0, 5);
}

function buildPrompt(state, base) {
  return `You are a construction project advisor for Indian builders. Analyse this project state and produce a 3–4 sentence narrative explaining the cost/schedule outlook. Avoid jargon. Currency: INR.\n\nProject: ${state.project.name}\nBudget: ₹${base.budget.toLocaleString("en-IN")}\nBilled so far: ₹${base.billed_so_far.toLocaleString("en-IN")}\nCurrent progress: ${state.project.progress}%\nProjected total: ₹${base.projected_total.toLocaleString("en-IN")}\nLikely overrun: ₹${base.overrun_amount.toLocaleString("en-IN")} (${base.overrun_pct}%)\nSchedule slip: ${base.schedule_slip_days} days\nOver-consumed materials: ${base.over_consumed_materials.map(m => `${m.name} (+${m.over_pct}%)`).join(", ") || "none"}\n`;
}
