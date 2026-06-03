// SiteTrack Pro — Zero-spend budget guard rail (Deno EF mirror).
//
// THIS FILE MUST STAY IN LOCK-STEP WITH src/lib/budgetMode.js — they
// share the same provider sets + decision logic so an Edge Function
// cannot accidentally bill when the browser side says it shouldn't.
//
// The tests in tests/budgetModeParity.test.js verify the two files
// declare identical provider sets at every level.

export const BUDGET_MODES = ["zero-spend", "paid"] as const;
export type BudgetMode = (typeof BUDGET_MODES)[number];

export const DEFAULT_BUDGET_MODE: BudgetMode = "zero-spend";

export const PAID_PROVIDERS = new Set<string>([
  "aws",
  "polygon-mainnet",
  "openai",
  "anthropic-api",
  "twilio",
]);

export const CAPPED_FREE_PROVIDERS = new Set<string>([
  "whatsapp-meta",
  "resend",
  "sentry",
  "supabase-free",
]);

export const ALWAYS_FREE_PROVIDERS = new Set<string>([
  "bhashini",
  "telegram",
  "polygon-amoy",
  "polygon-mumbai",
  "mock",
]);

export type Classification = "paid" | "capped-free" | "always-free" | "unknown";

export function getBudgetMode(env: Record<string, string | undefined> = {}): BudgetMode {
  const raw = env.BUDGET_MODE;
  if (raw && (BUDGET_MODES as readonly string[]).includes(raw)) return raw as BudgetMode;
  return DEFAULT_BUDGET_MODE;
}

export function classifyProvider(provider: string): Classification {
  if (PAID_PROVIDERS.has(provider)) return "paid";
  if (CAPPED_FREE_PROVIDERS.has(provider)) return "capped-free";
  if (ALWAYS_FREE_PROVIDERS.has(provider)) return "always-free";
  return "unknown";
}

export interface AllowedDecision {
  allowed: boolean;
  reason: string;
  classification: Classification;
}

export function isProviderAllowed(
  provider: string,
  env: Record<string, string | undefined> = {},
): AllowedDecision {
  const classification = classifyProvider(provider);
  if (classification === "unknown") {
    return {
      allowed: false,
      reason: `unknown provider: ${provider} — add to budget.ts sets`,
      classification,
    };
  }
  const mode = getBudgetMode(env);
  if (classification === "paid" && mode === "zero-spend") {
    return {
      allowed: false,
      reason: `${provider} is a paid provider and BUDGET_MODE=zero-spend; use a free alternative or set BUDGET_MODE=paid`,
      classification,
    };
  }
  return { allowed: true, reason: "", classification };
}

export function filterAllowedProviders(
  candidates: string[],
  env: Record<string, string | undefined> = {},
): string[] {
  return (candidates ?? []).filter(p => isProviderAllowed(p, env).allowed);
}

export interface BlockedResponse {
  ok: false;
  reason: string;
  provider: string;
  mode: BudgetMode;
  classification: Classification;
}

export function blockedResponse(
  provider: string,
  env: Record<string, string | undefined> = {},
): BlockedResponse {
  const decision = isProviderAllowed(provider, env);
  return {
    ok: false,
    reason: decision.reason || `${provider} blocked by budget mode`,
    provider,
    mode: getBudgetMode(env),
    classification: decision.classification,
  };
}
