// SiteTrack Pro — usePlanCaps hook + useCanByPlan.
//
// Loads the active org's plan + feature_caps and exposes a per-feature check.
// Fail-closed (SEC-05): while loading OR if the fetch errors, `can` returns
// false — a feature is only available once its plan caps are positively known.
// The gate components (PlanGate/QuotaGate) render a loading placeholder while
// caps fetch, so there is no "access denied" flicker and no accidental grant
// on a transient miss. Hard enforcement for dangerous/paid actions stays
// server-side (planCheck.ts, also fail-closed after SEC-05).

import { useEffect, useState } from "react";

import { useOrgSwitcher } from "./useOrgSwitcher";
import { hasPlanCap, planLimit, type PlanFeature, type PlanLimit, type PlanCaps } from "./planCaps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  const mod = await import("../lib/supabase");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

export interface UsePlanCapsReturn {
  plan: string | null;
  caps: Record<string, unknown> | null;
  loading: boolean;
  /** Does the active org's plan unlock this feature? Unknown (loading/error) → false (fail-closed). */
  can: (feature: PlanFeature) => boolean;
  /** Numeric limit (null = unlimited / unknown). */
  limit: (key: PlanLimit) => number | null;
  /** True while the org is inside an active Pro trial (subscriptions.status='trial', not expired). */
  trialActive: boolean;
  /** ISO timestamp of trial end (null when not in trial / unknown). */
  trialEndsAt: string | null;
}

export function usePlanCaps(): UsePlanCapsReturn {
  const { activeOrg } = useOrgSwitcher();
  const orgId = activeOrg?.orgId ?? null;
  const [state, setState] = useState<PlanCaps | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) { setState(null); setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const client = await getClient();
        if (!client) { if (!cancelled) { setState(null); setLoading(false); } return; }
        const { getPlanCaps } = await import("@/app/planCapsQueries");
        const res = await getPlanCaps(client, orgId);
        if (cancelled) return;
        setState(res.ok ? res.data : null);
        setLoading(false);
      } catch { if (!cancelled) { setState(null); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  return {
    plan: state?.plan ?? null,
    caps: state?.caps ?? null,
    loading,
    // Fail-closed (SEC-05): only grants when plan caps are positively known.
    // `state` is null while loading AND after a fetch failure, so both deny.
    can: (feature: PlanFeature) => !!state && hasPlanCap(state.caps, feature),
    limit: (key: PlanLimit) => planLimit(state?.caps, key),
    trialActive: !!state?.trialActive,
    trialEndsAt: state?.trialEndsAt ?? null,
  };
}

/** Convenience: just the boolean for one feature. */
export function useCanByPlan(feature: PlanFeature): boolean {
  return usePlanCaps().can(feature);
}
