// SiteTrack Pro — usePlanCaps hook + useCanByPlan.
//
// Loads the active org's plan + feature_caps and exposes a per-feature check.
// Fail-open is deliberate: while loading OR if the fetch errors, caps are null
// and callers should treat features as available until proven gated — we never
// want a transient fetch failure to hide a paid feature the org actually has.
// The hard enforcement for dangerous actions lives server-side (planCheck.ts).

import { useEffect, useState } from "react";

import { useOrgSwitcher } from "./useOrgSwitcher";
import { hasPlanCap, planLimit, type PlanFeature, type PlanLimit, type PlanCaps } from "./planCaps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  const mod = await import("../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

export interface UsePlanCapsReturn {
  plan: string | null;
  caps: Record<string, unknown> | null;
  loading: boolean;
  /** Does the active org's plan unlock this feature? Unknown while loading → true (fail-open in UI). */
  can: (feature: PlanFeature) => boolean;
  /** Numeric limit (null = unlimited / unknown). */
  limit: (key: PlanLimit) => number | null;
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
    // Fail-open while loading / unknown: don't hide a feature on a transient miss.
    can: (feature: PlanFeature) => (loading || !state ? true : hasPlanCap(state.caps, feature)),
    limit: (key: PlanLimit) => planLimit(state?.caps, key),
  };
}

/** Convenience: just the boolean for one feature. */
export function useCanByPlan(feature: PlanFeature): boolean {
  return usePlanCaps().can(feature);
}
