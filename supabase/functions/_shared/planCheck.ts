// SiteTrack Pro — server-side plan-feature enforcement for Edge Functions.
//
// Hard backstop for the UI plan gates (src/auth/PlanGate.tsx). A bored Basic-
// plan customer could curl an EF directly; this refuses paid/regulated actions
// the org's plan doesn't include.
//
// Safety posture (SEC-05 — fail closed):
//   • DEFINITIVE allow  → plan known, feature on.
//   • Anything else     → DENY (plan known + feature off → 402 PAYMENT_REQUIRED;
//                         infra error / missing org / missing plan row → also
//                         refused, never allowed). We do NOT break the deny-by-
//                         default posture on a transient miss: an unverifiable
//                         entitlement is refused, and the caller retries.
//
// capsAllow() is pure (no Deno/network deps) so it can be unit-tested in vitest.

// Deno is the runtime — declared here so this file also typechecks under Node
// tsc when tests import capsAllow (mirrors the auth.ts pattern).
declare const Deno: { env: { get(name: string): string | undefined } };

/** Pure decision: does this feature_caps object unlock the feature? Deny-by-default. */
export function capsAllow(caps: Record<string, unknown> | null | undefined, feature: string): boolean {
  return !!caps && caps[feature] === true;
}

export interface PlanVerdict {
  /** true = proceed; false = deny (402 in the EF for a plan miss; refuse otherwise). */
  allow: boolean;
  /** the org's plan id, when it could be read. */
  plan?: string;
}

/**
 * Does org `orgId`'s plan unlock `feature`? REST-only (small cold start).
 * Fail-CLOSED (SEC-05): any inability to positively verify the entitlement
 * (missing org/env, HTTP error, missing plan row, unexpected exception) is a
 * deny — never an allow. Each EF formats its own 402 from the verdict so
 * CORS/headers stay consistent with that function.
 */
export async function requirePlanFeature(orgId: string | null | undefined, feature: string): Promise<PlanVerdict> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!orgId || !url || !key) return { allow: false }; // can't verify → deny

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const orgRes = await fetch(`${url}/rest/v1/organizations?id=eq.${orgId}&select=plan`, { headers });
    if (!orgRes.ok) return { allow: false };
    const orgRows = await orgRes.json().catch(() => []);
    const plan = Array.isArray(orgRows) && orgRows[0]?.plan ? String(orgRows[0].plan) : null;
    if (!plan) return { allow: false };

    const planRes = await fetch(`${url}/rest/v1/plans?id=eq.${plan}&select=feature_caps`, { headers });
    if (!planRes.ok) return { allow: false, plan };
    const planRows = await planRes.json().catch(() => []);
    const caps = (Array.isArray(planRows) && planRows[0]?.feature_caps) || null;

    return { allow: capsAllow(caps as Record<string, unknown> | null, feature), plan };
  } catch (_e) {
    return { allow: false }; // any unexpected error → deny
  }
}
