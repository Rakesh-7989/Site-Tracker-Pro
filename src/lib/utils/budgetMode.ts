export const BUDGET_MODES: readonly string[] = ['zero-spend', 'paid'];
export const DEFAULT_BUDGET_MODE = 'zero-spend';

export const PAID_PROVIDERS: ReadonlySet<string> = new Set([
  'aws',
  'polygon-mainnet',
  'openai',
  'anthropic-api',
  'twilio',
]);

export const CAPPED_FREE_PROVIDERS: ReadonlySet<string> = new Set([
  'whatsapp-meta',
  'resend',
  'sentry',
  'supabase-free',
]);

export const ALWAYS_FREE_PROVIDERS: ReadonlySet<string> = new Set([
  'bhashini',
  'telegram',
  'polygon-amoy',
  'polygon-mumbai',
  'mock',
]);

export function getBudgetMode(env: Record<string, string | undefined> = {}): 'zero-spend' | 'paid' {
  const raw = env.BUDGET_MODE || env.VITE_BUDGET_MODE;
  if (raw && BUDGET_MODES.includes(raw)) {
    return raw === "paid" ? "paid" : "zero-spend";
  }
  return DEFAULT_BUDGET_MODE;
}

export function classifyProvider(provider: string): 'paid' | 'capped-free' | 'always-free' | 'unknown' {
  if (PAID_PROVIDERS.has(provider)) return 'paid';
  if (CAPPED_FREE_PROVIDERS.has(provider)) return 'capped-free';
  if (ALWAYS_FREE_PROVIDERS.has(provider)) return 'always-free';
  return 'unknown';
}

export function isProviderAllowed(provider: string, env: Record<string, string | undefined> = {}): { allowed: boolean; reason: string; classification: string } {
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

export function filterAllowedProviders(candidates: string[], env: Record<string, string | undefined> = {}): string[] {
  return (candidates || []).filter(p => isProviderAllowed(p, env).allowed);
}

export function blockedResponse(provider: string, env: Record<string, string | undefined> = {}): {
  ok: false; reason: string; provider: string; mode: string; classification: string;
} {
  const decision = isProviderAllowed(provider, env);
  return {
    ok: false,
    reason: decision.reason || `${provider} blocked by budget mode`,
    provider,
    mode: getBudgetMode(env),
    classification: decision.classification,
  };
}
