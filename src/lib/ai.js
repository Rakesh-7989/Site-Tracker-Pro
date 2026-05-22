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

// Build a compact LLM prompt from project payload
function buildPrompt(payload) {
  const r = computeRiskScore(payload);
  return [
    `You are a senior construction project advisor. Read the project snapshot and write a concise editorial-grade narrative summary in 4-6 short sentences. Tone: clear, factual, lightly editorial (no bullets, no headings, no emoji).`,
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
    `Now write the summary. End with one specific next action the architect should take this week.`,
  ].join("\n");
}

export async function fetchLLMInsight(payload) {
  const cfg = getProviderConfig();
  if (!cfg.provider || !cfg.apiKey) {
    return { ok: false, error: "no-key", fallback: computeRiskScore(payload) };
  }
  const prompt = buildPrompt(payload);
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
      return { ok: true, text, model: data.model, risk: computeRiskScore(payload) };
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
      return { ok: true, text, model: data.model, risk: computeRiskScore(payload) };
    }
    return { ok: false, error: "unknown-provider", fallback: computeRiskScore(payload) };
  } catch (err) {
    return { ok: false, error: err.message || String(err), fallback: computeRiskScore(payload) };
  }
}
