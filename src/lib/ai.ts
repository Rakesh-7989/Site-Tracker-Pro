interface Milestone {
  status?: string;
  due_date?: string;
  [key: string]: unknown;
}

interface Issue {
  status?: string;
  severity?: string;
  title?: string;
  [key: string]: unknown;
}

interface Rfi {
  status?: string;
  created?: string;
  [key: string]: unknown;
}

interface Permit {
  expiry?: string;
  [key: string]: unknown;
}

interface Safety {
  date?: string;
  [key: string]: unknown;
}

interface Expense {
  amount?: number;
  [key: string]: unknown;
}

interface ProjectPayload {
  name?: string;
  location?: string;
  status?: string;
  progress?: number;
  budget?: number;
  start_date?: string;
  expected_end_date?: string;
  [key: string]: unknown;
}

interface RiskPayload {
  milestones?: Milestone[];
  issues?: Issue[];
  rfis?: Rfi[];
  permits?: Permit[];
  safety?: Safety[];
  expenses?: Expense[];
  project?: ProjectPayload;
  [key: string]: unknown;
}

interface RiskFactor {
  label: string;
  weight: number;
  sign: "pos" | "neg";
}

interface RiskResult {
  score: number;
  level: string;
  factors: RiskFactor[];
}

export interface ProviderConfig {
  provider?: string;
  apiKey?: string;
  model?: string;
}

export interface LLMOpts {
  lang?: string;
}

interface LLMResult {
  ok: boolean;
  text?: string;
  model?: string;
  lang?: string;
  error?: string;
  fallback?: RiskResult;
}

const KEY_STORAGE = "sitetrack_ai_provider_v1";

export function getProviderConfig(): ProviderConfig {
  try { return JSON.parse(localStorage.getItem(KEY_STORAGE) || "{}"); }
  catch { return {}; }
}

export function saveProviderConfig(cfg: ProviderConfig): void {
  try { localStorage.setItem(KEY_STORAGE, JSON.stringify(cfg)); } catch {}
}

export function clearProviderConfig(): void {
  try { localStorage.removeItem(KEY_STORAGE); } catch {}
}

export function computeRiskScore(payload: RiskPayload): RiskResult {
  const { milestones = [], issues = [], rfis = [], permits = [], safety = [], expenses = [], project = {} } = payload || {};
  const today = new Date();
  const factors: RiskFactor[] = [];

  const overdue = milestones.filter((m: Milestone) => m.status !== "completed" && m.due_date && new Date(m.due_date) < today);
  if (overdue.length) factors.push({ label: `${overdue.length} milestone(s) overdue`, weight: overdue.length * 12, sign: "neg" });

  const highIss = issues.filter((i: Issue) => i.status === "open" && i.severity === "high");
  if (highIss.length) factors.push({ label: `${highIss.length} HIGH-severity issue(s) open`, weight: highIss.length * 15, sign: "neg" });

  const oldRFIs = rfis.filter((r: Rfi) => r.status === "open" && r.created && (today.getTime() - new Date(r.created).getTime()) > 7 * 86400 * 1000);
  if (oldRFIs.length) factors.push({ label: `${oldRFIs.length} RFI(s) open >7 days`, weight: oldRFIs.length * 6, sign: "neg" });

  const expiringPermits = permits.filter((p: Permit) => p.expiry && new Date(p.expiry).getTime() - today.getTime() < 30 * 86400 * 1000 && new Date(p.expiry).getTime() - today.getTime() > 0);
  if (expiringPermits.length) factors.push({ label: `${expiringPermits.length} permit(s) expire within 30 days`, weight: expiringPermits.length * 8, sign: "neg" });

  const recentSafety = safety.filter((s: Safety) => s.date && (today.getTime() - new Date(s.date).getTime()) < 14 * 86400 * 1000);
  if (recentSafety.length) factors.push({ label: `${recentSafety.length} safety incident(s) in last 14 days`, weight: recentSafety.length * 10, sign: "neg" });

  if (project.budget && project.budget > 0) {
    const spent = expenses.reduce((s: number, e: Expense) => s + (e.amount || 0), 0);
    const burn = Math.round((spent / project.budget) * 100);
    if (burn > 90) factors.push({ label: `Budget burn ${burn}% — near exhaustion`, weight: 20, sign: "neg" });
    else if (burn < (project.progress || 0) - 15) factors.push({ label: `Spending well under progress curve (${burn}% spent vs ${project.progress}% complete)`, weight: 6, sign: "pos" });
  }

  if (project.expected_end_date && project.progress != null) {
    const start = new Date(project.start_date || today);
    const end = new Date(project.expected_end_date);
    const total = end.getTime() - start.getTime();
    const elapsed = today.getTime() - start.getTime();
    const scheduledPct = total > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))) : 0;
    const lag = scheduledPct - (project.progress || 0);
    if (lag > 15) factors.push({ label: `Progress lagging schedule by ~${lag}%`, weight: Math.min(25, lag), sign: "neg" });
    else if (lag < -10) factors.push({ label: `Ahead of schedule by ~${Math.abs(lag)}%`, weight: 8, sign: "pos" });
  }

  const negWeight = factors.filter(f => f.sign === "neg").reduce((s, f) => s + f.weight, 0);
  const posWeight = factors.filter(f => f.sign === "pos").reduce((s, f) => s + f.weight, 0);
  const score = Math.max(0, Math.min(100, 100 - negWeight + posWeight));
  const level = score >= 75 ? "healthy" : score >= 50 ? "watch" : score >= 25 ? "at-risk" : "critical";
  return { score, level, factors };
}

export const LANG_INSTRUCTIONS: Record<string, Record<string, string>> = {
  en: {
    persona: "You are a senior construction project advisor.",
    style: "Write a concise editorial-grade narrative summary in 4-6 short sentences. Tone: clear, factual, lightly editorial (no bullets, no headings, no emoji).",
    closer: "End with one specific next action the architect should take this week.",
  },
  te: {
    persona: "Meeru oka senior construction project advisor. Telugu lo mathladandi (transliterated English ledha Telugu script — natural ga unde okati pick cheyandi).",
    style: "4-6 chinna sentences lo editorial-tone summary rayandi. Bullets vaadakandi, headings vaadakandi, emoji vaadakandi. Spashtam ga, factual ga.",
    closer: "Last sentence lo — ee week lo architect cheyali ane oka specific action cheppandi.",
  },
  hi: {
    persona: "Aap ek senior construction project advisor hain. Hindi mein likhein (transliterated English ya Devanagari — jo natural lage).",
    style: "4-6 short sentences mein editorial-tone summary likhein. Bullets nahi, headings nahi, emoji nahi. Spashta aur factual.",
    closer: "Aakhri sentence mein — is week mein architect ko ek specific action karna chahiye, wo bataiye.",
  },
};

function buildPrompt(payload: RiskPayload, lang = "en"): string {
  const r = computeRiskScore(payload);
  const inst = LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.en;
  return [
    `${inst.persona} ${inst.style}`,
    ``,
    `Project: ${payload.project?.name || ""} — ${payload.project?.location || "—"}`,
    `Status: ${payload.project?.status || ""} · Progress: ${payload.project?.progress || 0}%`,
    `Budget: ₹${(payload.project?.budget || 0).toLocaleString("en-IN")} · Expected end: ${payload.project?.expected_end_date || "—"}`,
    ``,
    `Computed risk score: ${r.score}/100 (${r.level})`,
    `Risk factors:`,
    ...r.factors.map(f => `- [${f.sign === "neg" ? "RISK" : "GOOD"}] ${f.label} (weight ${f.weight})`),
    ``,
    `Recent open issues (top 3):`,
    ...((payload.issues || []).filter((i: Issue) => i.status === "open").slice(0, 3).map((i: Issue) => `- ${i.severity?.toUpperCase() || ""}: ${i.title}`)),
    ``,
    inst.closer,
  ].join("\n");
}

export async function fetchLLMInsight(payload: RiskPayload | string, opts: LLMOpts = {}): Promise<LLMResult> {
  const cfg = getProviderConfig();
  const isPayload = typeof payload === "object";
  if (!cfg.provider || !cfg.apiKey) {
    return { ok: false, error: "no-key", fallback: isPayload ? computeRiskScore(payload) : undefined };
  }
  let lang = opts.lang || "en";
  try {
    const stored = JSON.parse(localStorage.getItem("sitetrack_v2") || "{}").lang;
    if (stored) lang = stored;
  } catch {}
  if (!LANG_INSTRUCTIONS[lang]) lang = "en";
  const prompt = isPayload ? buildPrompt(payload, lang) : (payload as string);
  try {
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: cfg.model || "claude-3-5-haiku-20241022",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = (data.content || []).map((c: { text: string }) => c.text).join("\n").trim();
      return { ok: true, text, model: data.model, lang };
    }
    if (cfg.provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model || "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 400,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || "";
      return { ok: true, text, model: data.model, lang };
    }
    return { ok: false, error: "unknown-provider", fallback: isPayload ? computeRiskScore(payload) : undefined };
  } catch (err) {
    return { ok: false, error: (err as Error).message || String(err), fallback: isPayload ? computeRiskScore(payload) : undefined };
  }
}
