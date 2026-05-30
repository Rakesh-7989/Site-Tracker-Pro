// SiteTrack Pro — AI Insights layer
//
// The frontend ships a deterministic rule-based engine that runs against
// project data. When an API key is configured (Settings → API Key), the same
// project payload is sent to Claude / OpenAI for a richer narrative summary.
//
// IMPORTANT: This module is a SCAFFOLD. Calling fetchLLMInsight() from the
// browser with a long-lived API key exposes that key. Production should route
// through the Supabase Edge Function defined in BACKEND_PLAN.md ("generate-ai-
// insight"). The function calls Anthropic/OpenAI server-side and returns text.
//
// For the demo / paid pilot stage, users may paste their own key — it stays in
// their browser localStorage and never leaves the device except to the LLM
// provider.

const KEY_STORAGE = "sitetrack_ai_provider_v1";

export function getProviderConfig() {
  try { return JSON.parse(localStorage.getItem(KEY_STORAGE) || "{}"); }
  catch { return {}; }
}

export function saveProviderConfig(cfg) {
  try { localStorage.setItem(KEY_STORAGE, JSON.stringify(cfg)); } catch {}
}

export function clearProviderConfig() {
  try { localStorage.removeItem(KEY_STORAGE); } catch {}
}

// Deterministic risk score — always available, no LLM needed.
// Returns { score: 0-100, level, factors: [{label, weight, sign}] }
export function computeRiskScore(payload) {
  const { milestones = [], issues = [], rfis = [], permits = [], safety = [], expenses = [], project = {} } = payload || {};
  const today = new Date();
  const factors = [];

  // Overdue milestones
  const overdue = milestones.filter(m => m.status !== "completed" && m.due_date && new Date(m.due_date) < today);
  if (overdue.length) factors.push({ label: `${overdue.length} milestone(s) overdue`, weight: overdue.length * 12, sign: "neg" });

  // Open high-severity issues
  const highIss = issues.filter(i => i.status === "open" && i.severity === "high");
  if (highIss.length) factors.push({ label: `${highIss.length} HIGH-severity issue(s) open`, weight: highIss.length * 15, sign: "neg" });

  // Stale RFIs
  const oldRFIs = rfis.filter(r => r.status === "open" && r.created && (today - new Date(r.created)) > 7 * 86400 * 1000);
  if (oldRFIs.length) factors.push({ label: `${oldRFIs.length} RFI(s) open >7 days`, weight: oldRFIs.length * 6, sign: "neg" });

  // Expiring permits
  const expiringPermits = permits.filter(p => p.expiry && new Date(p.expiry) - today < 30 * 86400 * 1000 && new Date(p.expiry) - today > 0);
  if (expiringPermits.length) factors.push({ label: `${expiringPermits.length} permit(s) expire within 30 days`, weight: expiringPermits.length * 8, sign: "neg" });

  // Recent safety incidents
  const recentSafety = safety.filter(s => s.date && (today - new Date(s.date)) < 14 * 86400 * 1000);
  if (recentSafety.length) factors.push({ label: `${recentSafety.length} safety incident(s) in last 14 days`, weight: recentSafety.length * 10, sign: "neg" });

  // Budget burn
  if (project.budget > 0) {
    const spent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const burn = Math.round((spent / project.budget) * 100);
    if (burn > 90) factors.push({ label: `Budget burn ${burn}% — near exhaustion`, weight: 20, sign: "neg" });
    else if (burn < (project.progress || 0) - 15) factors.push({ label: `Spending well under progress curve (${burn}% spent vs ${project.progress}% complete)`, weight: 6, sign: "pos" });
  }

  // Progress vs schedule heuristic
  if (project.expected_end_date && project.progress != null) {
    const start = new Date(project.start_date || today);
    const end = new Date(project.expected_end_date);
    const total = end - start;
    const elapsed = today - start;
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

// Session 22: language-specific tone instructions for AI Insights v2.
// Site-Tracker is the only Indian construction SaaS that returns the LLM
// narrative in Telugu / Hindi natively — unique competitive differentiator.
//
// Why this matters: a Hyderabad PM who reads Telugu fluently shouldn't have
// to interpret English-only AI commentary. Translating in the prompt is
// cheaper, faster, and more idiomatic than running a separate translation
// pass over English output.
const LANG_INSTRUCTIONS = {
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

// Build a compact LLM prompt from project payload.
// `lang` ∈ "en" | "te" | "hi" — defaults to en for back-compat.
function buildPrompt(payload, lang = "en") {
  const r = computeRiskScore(payload);
  const inst = LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.en;
  return [
    `${inst.persona} ${inst.style}`,
    ``,
    `Project: ${payload.project?.name} — ${payload.project?.location || "—"}`,
    `Status: ${payload.project?.status} · Progress: ${payload.project?.progress || 0}%`,
    `Budget: ₹${(payload.project?.budget || 0).toLocaleString("en-IN")} · Expected end: ${payload.project?.expected_end_date || "—"}`,
    ``,
    `Computed risk score: ${r.score}/100 (${r.level})`,
    `Risk factors:`,
    ...r.factors.map(f => `- [${f.sign === "neg" ? "RISK" : "GOOD"}] ${f.label} (weight ${f.weight})`),
    ``,
    `Recent open issues (top 3):`,
    ...((payload.issues || []).filter(i => i.status === "open").slice(0, 3).map(i => `- ${i.severity?.toUpperCase()}: ${i.title}`)),
    ``,
    inst.closer,
  ].join("\n");
}

export { LANG_INSTRUCTIONS };

export async function fetchLLMInsight(payload, opts = {}) {
  const cfg = getProviderConfig();
  if (!cfg.provider || !cfg.apiKey) {
    return { ok: false, error: "no-key", fallback: computeRiskScore(payload) };
  }
  // Session 22: pick output language. Caller passes opts.lang ("en"|"te"|"hi");
  // falls back to the user's session language stored in localStorage, else "en".
  let lang = opts.lang;
  if (!lang) {
    try { lang = JSON.parse(localStorage.getItem("sitetrack_v2") || "{}").lang || "en"; }
    catch { lang = "en"; }
  }
  if (!LANG_INSTRUCTIONS[lang]) lang = "en";
  const prompt = buildPrompt(payload, lang);
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
      const text = (data.content || []).map(c => c.text).join("\n").trim();
      return { ok: true, text, model: data.model, lang, risk: computeRiskScore(payload) };
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
      return { ok: true, text, model: data.model, lang, risk: computeRiskScore(payload) };
    }
    return { ok: false, error: "unknown-provider", fallback: computeRiskScore(payload) };
  } catch (err) {
    return { ok: false, error: err.message || String(err), fallback: computeRiskScore(payload) };
  }
}
