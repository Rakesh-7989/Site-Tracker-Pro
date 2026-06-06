// SiteTrack Pro — server-side plan-feature enforcement for Edge Functions.
//
// Hard backstop for the UI plan gates (src/auth/PlanGate.tsx). A bored Basic-
// plan customer could curl an EF directly; this refuses paid/regulated actions
// the org's plan doesn't include.
//
// Safety posture:
//   • DEFINITIVE deny (plan known, feature off) → 402 PAYMENT_REQUIRED.
//   • Infra error (can't read DB / env missing) → FAIL-OPEN (allow). We never
//     break a legitimate paying customer's call because of a transient miss;
//     the role/auth gates already ran upstream.
//
// capsAllow() is pure (no Deno/network deps) so it can be unit-tested in vitest.

/** Pure decision: does this feature_caps object unlock the feature? Deny-by-default. */
export function capsAllow(caps: Record<string, unknown> | null | undefined, feature: string): boolean {
  return !!caps && caps[feature] === true;
}

export interface PlanVerdict {
  /** true = proceed; false = definitive deny (return 402 in the EF). */
  allow: boolean;
  /** the org's plan id, when it could be read. */
  plan?: string;
}

/**
 * Does org `orgId`'s plan unlock `feature`? REST-only (small cold start).
 * Fail-open on infra error / missing org; fail-closed only on a definitive
 * "plan known, feature off". Each EF formats its own 402 from the verdict so
 * CORS/headers stay consistent with that function.
 */
export async function requirePlanFeature(orgId: string | null | undefined, feature: string): Promise<PlanVerdict> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!orgId || !url || !key) return { allow: true }; // can't decide → fail open

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const orgRes = await fetch(`${url}/rest/v1/organizations?id=eq.${orgId}&select=plan`, { headers });
    if (!orgRes.ok) return { allow: true };
    const orgRows = await orgRes.json().catch(() => []);
    const plan = Array.isArray(orgRows) && orgRows[0]?.plan ? String(orgRows[0].plan) : null;
    if (!plan) return { allow: true };

    const planRes = await fetch(`${url}/rest/v1/plans?id=eq.${plan}&select=feature_caps`, { headers });
    if (!planRes.ok) return { allow: true, plan };
    const planRows = await planRes.json().catch(() => []);
    const caps = (Array.isArray(planRows) && planRows[0]?.feature_caps) || null;

    return { allow: capsAllow(caps as Record<string, unknown> | null, feature), plan };
  } catch (_e) {
    return { allow: true }; // any unexpected error → fail open
  }
}
