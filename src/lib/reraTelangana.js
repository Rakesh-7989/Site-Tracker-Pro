// SiteTrack Pro — RERA Telangana auto-filing adapter.
//
// Strategic context (from the pitch deck Priority 1):
//   RERA monthly progress filings are mandatory for every registered project
//   in Telangana. Manual filings cost ₹5,000-15,000 per quarter in CA fees,
//   plus late-filing penalties of up to ₹50,000/year. Automating this is the
//   single highest-ROI feature for any TG builder customer.
//
// Architecture (adapter pattern — same shape as orgIntegrations + cashfree):
//   - PURE validators in src/lib/compliance.js (already exists) — regex-only
//     format checks. Always available.
//   - This file: pluggable status-lookup + progress-filing adapters.
//   - Two adapters ship: `mockAdapter()` (always works, returns fake data
//     useful for dev + demo) and `tgReraAdapter()` (real TG RERA portal
//     when credentials are configured).
//
// Real TG RERA portal: https://rera.telangana.gov.in
//   - Public status check via project number (no auth required for read)
//   - Monthly progress filing requires login + OTP (HTML form submission,
//     no public API — needs Puppeteer/Playwright server-side scraping)
//
// Until TG RERA publishes a real API, the production adapter is a thin
// scraper that runs in a Supabase Edge Function on a weekly cron. Until
// that ships, customers use `mockAdapter` (validates format, no real submit).

import { validateRera as checkReraFormat } from "./compliance.js";

/** Supported RERA states. Add adapters here as we ship them. */
export const SUPPORTED_STATES = ["telangana", "karnataka", "maharashtra"];

/** Construction stage codes recognised by TG RERA's quarterly form. */
export const STAGE_CODES = {
  EXC: "Excavation",
  FOU: "Foundation",
  PLI: "Plinth",
  GFL: "Ground Floor",
  SUP: "Superstructure",
  BWK: "Brickwork",
  PLA: "Plastering",
  FLO: "Flooring",
  FIN: "Finishing",
  HND: "Handover",
};

/** Stage rollup heuristic — map BOQ category progress → primary RERA stage. */
export function inferReraStage(progressPct) {
  if (progressPct >= 95) return "HND";
  if (progressPct >= 85) return "FIN";
  if (progressPct >= 70) return "FLO";
  if (progressPct >= 55) return "PLA";
  if (progressPct >= 40) return "BWK";
  if (progressPct >= 25) return "SUP";
  if (progressPct >= 18) return "GFL";
  if (progressPct >= 12) return "PLI";
  if (progressPct >= 6) return "FOU";
  return "EXC";
}

/**
 * Build the RERA monthly progress filing payload from a project snapshot.
 * Returns the JSON shape that the TG RERA adapter expects.
 */
export function buildFilingPayload(project, options = {}) {
  if (!project?.id) throw new Error("buildFilingPayload: project.id required");
  const month = options.month || new Date().toISOString().slice(0, 7); // YYYY-MM
  const progress = options.progressOverride ?? project.progress ?? 0;
  const totalBudget = project.budget || 0;
  const spent = options.spent || 0;
  return {
    project_id: project.id,
    rera_number: project.rera_number || project.reraNumber || null,
    month,
    physical_progress_pct: Math.round(progress),
    primary_stage: inferReraStage(progress),
    financial: {
      budgeted_inr: totalBudget,
      spent_inr: spent,
      collected_from_buyers_inr: options.collected || 0,
    },
    workforce: options.workersOnSite ?? 0,
    quality_notes: options.qualityNotes || "Standard build progressing per plan.",
    submitted_by: options.submittedBy || "system",
    submitted_at: new Date().toISOString(),
  };
}

/**
 * Validate a payload before submission. Returns { ok, errors }.
 * Pure — no network. Mirrors what TG RERA's server-side validation would do.
 */
export function validateFilingPayload(payload) {
  const errors = [];
  if (!payload?.project_id) errors.push("project_id required");
  if (!payload?.rera_number) errors.push("rera_number required");
  else {
    const fmt = checkReraFormat(payload.rera_number);
    if (!fmt.ok) errors.push(`rera_number invalid format: ${fmt.reason}`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.month || "")) {
    errors.push("month must be YYYY-MM");
  }
  if (typeof payload.physical_progress_pct !== "number" ||
      payload.physical_progress_pct < 0 || payload.physical_progress_pct > 100) {
    errors.push("physical_progress_pct must be 0-100");
  }
  if (!STAGE_CODES[payload.primary_stage]) {
    errors.push(`primary_stage must be one of: ${Object.keys(STAGE_CODES).join(", ")}`);
  }
  if (payload.financial && payload.financial.spent_inr > payload.financial.budgeted_inr) {
    errors.push("spent_inr cannot exceed budgeted_inr");
  }
  return { ok: errors.length === 0, errors };
}

// ── ADAPTERS ──────────────────────────────────────────────────────────────

/**
 * Mock adapter — useful for dev, tests, and on-boarding demos. Always
 * succeeds when the payload validates. Returns a deterministic fake
 * acknowledgement number so downstream UI works end-to-end.
 */
export function mockAdapter() {
  const submissions = [];
  return {
    state: "mock",
    async checkStatus(reraNumber) {
      const fmt = checkReraFormat(reraNumber);
      if (!fmt.ok) return { ok: false, error: fmt.reason };
      return {
        ok: true,
        rera_number: reraNumber,
        status: "active",
        registered_on: "2024-04-01",
        promoter: "Mock Builders Pvt Ltd",
        notes: "MOCK adapter — real data needs the tgReraAdapter() + creds.",
      };
    },
    async submitFiling(payload) {
      const v = validateFilingPayload(payload);
      if (!v.ok) return { ok: false, errors: v.errors };
      const ack = `MOCK-${payload.month}-${Date.now().toString(36).toUpperCase()}`;
      const record = { ack, payload, submitted_at: new Date().toISOString() };
      submissions.push(record);
      return { ok: true, ack, message: "MOCK filing recorded (no real submission)." };
    },
    _submissions: submissions,
  };
}

/**
 * Real TG RERA adapter — calls into a Supabase Edge Function `tg-rera-submit`
 * which wraps the actual portal scraper (Puppeteer on Deno). Until that
 * Edge Function is deployed, this adapter falls back to a clear error so
 * the UI can guide the user to configure credentials.
 *
 * Required config (from org_integrations.rera_telangana):
 *   { portal_username, portal_password, otp_phone, edge_function_url }
 */
export function tgReraAdapter(cfg) {
  if (!cfg?.edge_function_url) {
    throw new Error("tgReraAdapter: edge_function_url required (deploy supabase/functions/tg-rera-submit first)");
  }
  return {
    state: "telangana",
    async checkStatus(reraNumber) {
      const fmt = checkReraFormat(reraNumber);
      if (!fmt.ok) return { ok: false, error: fmt.reason };
      // Public status check — no auth needed
      try {
        const res = await fetch(`${cfg.edge_function_url}/status?rera_number=${encodeURIComponent(reraNumber)}`);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        return await res.json();
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
    async submitFiling(payload) {
      const v = validateFilingPayload(payload);
      if (!v.ok) return { ok: false, errors: v.errors };
      if (!cfg.portal_username || !cfg.portal_password) {
        return { ok: false, error: "RERA portal credentials not configured. Add in Integrations → RERA Telangana." };
      }
      try {
        const res = await fetch(`${cfg.edge_function_url}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portal_username: cfg.portal_username,
            // NEVER expose password in logs; send over HTTPS to your own EF only
            portal_password: cfg.portal_password,
            otp_phone: cfg.otp_phone,
            filing: payload,
          }),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text().catch(() => "")}` };
        return await res.json();
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };
}

/** Pick the right adapter from org config. Falls back to mock when unset. */
export function pickAdapter(state, cfg) {
  if (state === "telangana" && cfg?.edge_function_url) {
    try { return tgReraAdapter(cfg); }
    catch { return mockAdapter(); }
  }
  return mockAdapter();
}
