// SiteTrack Pro — Zero-spend budget guard rail.
//
// The founder cannot spend money on software / cloud services through
// June 2027 (see docs/ZERO_SPEND_POLICY.md). This module is the single
// source of truth for "is this provider / network paid, and may we
// invoke it right now?" — every call site that could bill must check
// here BEFORE invoking the paid surface.
//
// Why a module instead of inline checks: it is too easy to ship a
// branch that bypasses the guard if every EF / lib makes its own
// decision. Centralizing means flipping budget mode later is a single
// env change, and lint + tests can enforce that no code path bills
// without going through this module.
//
// Mirror in `supabase/functions/_shared/budget.ts` — keep both files
// in lock-step. Tests pin the shapes.

/** Budget mode values. Default is the strictest. */
export const BUDGET_MODES = ['zero-spend', 'paid'];

/** Default mode when env is unset — defensive, prevents accidents. */
export const DEFAULT_BUDGET_MODE = 'zero-spend';

/**
 * Paid third-party providers. Add to this set whenever a new bill-able
 * dependency is wired in. Each entry should have a free alternative
 * documented in docs/ZERO_SPEND_POLICY.md.
 */
export const PAID_PROVIDERS = new Set([
  'aws',                // AWS Transcribe / S3 — billed per use
  'polygon-mainnet',    // Polygon mainnet gas — ~₹0.50/anchor
  'openai',             // OpenAI API — per-token
  'anthropic-api',      // Anthropic API — per-token
  'twilio',             // Twilio WhatsApp / SMS — per-message
]);

/**
 * Free-tier providers — usage capped by the provider, not billed unless
 * the cap is exceeded. The guard returns `allowed: true` for these but
 * may emit a soft warning when usage approaches the cap.
 */
export const CAPPED_FREE_PROVIDERS = new Set([
  'whatsapp-meta',      // Meta Cloud API — 1k free service conversations/mo
  'resend',             // Resend — 3k emails/mo, 100/day
  'sentry',             // Sentry — 5k errors/mo
  'supabase-free',      // Supabase Free — 500MB DB, 500k EF invocations/mo
]);

/** Always-free providers — no usage cap. */
export const ALWAYS_FREE_PROVIDERS = new Set([
  'bhashini',           // Bhashini — free for startups (gated by application)
  'telegram',           // Telegram bot API — unlimited
  'polygon-amoy',       // Polygon Amoy testnet — free MATIC from faucet
  'polygon-mumbai',     // Mumbai testnet (deprecated; kept for back-compat)
  'mock',               // Test mode
]);

/**
 * Get the current budget mode. Reads from the provided env or falls back
 * to the DEFAULT_BUDGET_MODE so a missing env never accidentally bills.
 *
 * @param {object} [env]  Environment object (process.env, Deno.env, or {})
 * @returns {'zero-spend' | 'paid'}
 */
export function getBudgetMode(env = {}) {
  const raw = env.BUDGET_MODE || env.VITE_BUDGET_MODE;
  if (raw && BUDGET_MODES.includes(raw)) return raw;
  return DEFAULT_BUDGET_MODE;
}

/**
 * Classify a provider's cost shape.
 *
 * @param {string} provider
 * @returns {'paid' | 'capped-free' | 'always-free' | 'unknown'}
 */
export function classifyProvider(provider) {
  if (PAID_PROVIDERS.has(provider)) return 'paid';
  if (CAPPED_FREE_PROVIDERS.has(provider)) return 'capped-free';
  if (ALWAYS_FREE_PROVIDERS.has(provider)) return 'always-free';
  return 'unknown';
}

/**
 * Decision API — call this BEFORE invoking any third-party provider.
 *
 * @param {string} provider  — the provider name (must match a known set)
 * @param {object} [env]     — environment object
 * @returns {{allowed: boolean, reason: string, classification: string}}
 */
export function isProviderAllowed(provider, env = {}) {
  const classification = classifyProvider(provider);
  if (classification === 'unknown') {
    return { allowed: false, reason: `unknown provider: ${provider} — add to budgetMode.js sets`, classification };
  }
  const mode = getBudgetMode(env);
  if (classification === 'paid' && mode === 'zero-spend') {
    return {
      allowed: false,
      reason: `${provider} is a paid provider and BUDGET_MODE=zero-spend; use a free alternative or set BUDGET_MODE=paid`,
      classification,
    };
  }
  return { allowed: true, reason: '', classification };
}

/**
 * Filter a candidate provider list down to those allowed by the current
 * budget mode, preserving order. Useful for fallback chains.
 *
 * @param {string[]} candidates
 * @param {object}   [env]
 * @returns {string[]}
 */
export function filterAllowedProviders(candidates, env = {}) {
  return (candidates || []).filter(p => isProviderAllowed(p, env).allowed);
}

/**
 * Build a structured guard-decision object suitable for logging /
 * returning from an Edge Function when a paid call is blocked. The shape
 * matches `_shared/budget.ts` so the browser + EF can speak the same
 * dialect.
 *
 * @param {string} provider
 * @param {object} [env]
 * @returns {{ok: false, reason: string, provider: string, mode: string, classification: string}}
 */
export function blockedResponse(provider, env = {}) {
  const decision = isProviderAllowed(provider, env);
  return {
    ok: false,
    reason: decision.reason || `${provider} blocked by budget mode`,
    provider,
    mode: getBudgetMode(env),
    classification: decision.classification,
  };
}
