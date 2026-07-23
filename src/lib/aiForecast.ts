import { fetchLLMInsight, type ProviderConfig } from "./ai";
import type { LLMOpts } from "./ai";

interface ProjectState {
  project: {
    name?: string;
    budget?: number;
    progress?: number;
    start_date?: string | null;
    expected_end_date?: string | null;
    [key: string]: unknown;
  } | null;
  boq?: Record<string, unknown>[];
  ra?: Record<string, unknown>[];
  ledger?: Record<string, unknown>[];
  updates?: Record<string, unknown>[];
  [key: string]: unknown;
}

interface DeterministicResult {
  budget: number;
  billed_so_far: number;
  projected_total: number;
  overrun_amount: number;
  overrun_pct: number;
  schedule_slip_days: number;
  confidence: string;
  over_consumed_materials: { name: string; planned: number; consumed: number; over_pct: number }[];
  generated_at: string;
  mode: string;
  narrative?: string;
  llm_error?: string;
}

interface OverConsumedItem {
  name: string;
  planned: number;
  consumed: number;
  over_pct: number;
}

export function forecastDeterministic(state: ProjectState): DeterministicResult | null {
  const { project, boq = [], ra = [], ledger = [], updates = [] } = state || {};
  if (!project) return null;

  const budget = Number(project.budget) || 0;
  const billedSoFar = ra.reduce((s: number, r) => s + (Number(r.amount) || 0), 0);
  const progressPct = Math.max(1, Number(project.progress) || 1);
  const projectedTotal = (billedSoFar / progressPct) * 100;
  const overrun = Math.max(0, Math.round(projectedTotal - budget));

  const start = project.start_date ? new Date(project.start_date) : null;
  const expectedEnd = project.expected_end_date ? new Date(project.expected_end_date) : null;
  let slipDays = 0;
  if (start && expectedEnd) {
    const elapsed = (Date.now() - start.getTime()) / 86400000;
    const total = (expectedEnd.getTime() - start.getTime()) / 86400000;
    const expectedProgress = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const lag = expectedProgress - progressPct;
    slipDays = Math.round((lag / 100) * total);
  }

  let confidence = "low";
  const dataPoints = ra.length + ledger.length + updates.length;
  if (dataPoints >= 25) confidence = "high";
  else if (dataPoints >= 10) confidence = "medium";

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

export async function forecastWithLlm(state: ProjectState, aiCfg: ProviderConfig): Promise<DeterministicResult | null> {
  const base = forecastDeterministic(state);
  if (!base) return null;
  if (!aiCfg?.provider || !aiCfg?.apiKey) {
    return { ...base, narrative: defaultNarrative(base), mode: "deterministic" };
  }
  const prompt = buildPrompt(state, base);
  try {
    const res = await fetchLLMInsight(prompt, aiCfg as unknown as LLMOpts);
    return { ...base, narrative: res?.text || defaultNarrative(base), mode: "llm" };
  } catch (e) {
    return { ...base, narrative: defaultNarrative(base), mode: "deterministic", llm_error: String((e as Error)?.message || e) };
  }
}

function defaultNarrative(f: DeterministicResult): string {
  const parts: string[] = [];
  if (f.overrun_amount > 0) {
    parts.push(`At the current burn rate, the project is on track to overshoot the budget by ₹${f.overrun_amount.toLocaleString("en-IN")} (${f.overrun_pct}%).`);
  } else {
    parts.push("The project is currently within budget at the current burn rate.");
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

function detectOverConsumption(boq: Record<string, unknown>[], ledger: Record<string, unknown>[]): OverConsumedItem[] {
  const planned: Record<string, number> = {};
  for (const item of boq || []) {
    const key = String(item.description || item.code || "").toLowerCase().trim();
    if (!key) continue;
    planned[key] = (planned[key] || 0) + (Number(item.qty) || 0);
  }
  const consumed: Record<string, number> = {};
  for (const row of ledger || []) {
    if (row.direction !== "outward") continue;
    const key = String(row.material || "").toLowerCase().trim();
    if (!key) continue;
    consumed[key] = (consumed[key] || 0) + (Number(row.qty) || 0);
  }
  const out: OverConsumedItem[] = [];
  for (const key of Object.keys(consumed)) {
    const plan = planned[key];
    if (!plan) continue;
    if (consumed[key] > plan * 1.05) {
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

function buildPrompt(state: ProjectState, base: DeterministicResult): string {
  return `You are a construction project advisor for Indian builders. Analyse this project state and produce a 3–4 sentence narrative explaining the cost/schedule outlook. Avoid jargon. Currency: INR.\n\nProject: ${state.project?.name}\nBudget: ₹${base.budget.toLocaleString("en-IN")}\nBilled so far: ₹${base.billed_so_far.toLocaleString("en-IN")}\nCurrent progress: ${state.project?.progress}%\nProjected total: ₹${base.projected_total.toLocaleString("en-IN")}\nLikely overrun: ₹${base.overrun_amount.toLocaleString("en-IN")} (${base.overrun_pct}%)\nSchedule slip: ${base.schedule_slip_days} days\nOver-consumed materials: ${base.over_consumed_materials.map(m => `${m.name} (+${m.over_pct}%)`).join(", ") || "none"}\n`;
}
