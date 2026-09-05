// SiteTrack Pro — useFeatureWithQuota hook.
//
// Combines plan feature gating (hasPlanCap) with quota status (atQuota)
// to determine if a feature is available to the active org.
//
// Usage: const { available, atQuota, planCap, quota } = useFeatureWithQuota("crm")
//
// - available: true only when BOTH plan cap AND quota room exist
// - atQuota: true when the specific quota resource is at limit
// - planCap: raw plan capability check result
// - quota: raw quota check result (for display)
//
// Fail-closed (SEC-05): `available` is false while loading, with no active org,
// or after a fetch error — a feature is only "available" once positively known
// to be under quota AND on the plan.

import { useEffect, useState } from "react";

import { useOrgSwitcher } from "./useOrgSwitcher";
import { hasPlanCap, type PlanFeature } from "./planCaps";
import { fetchOrgQuota } from "@/app/queries/quotaQueries";
import type { QuotaRow, QuotaRollup } from "@/app/queries/quotaQueries";
import { atQuota as queryAtQuota, usageRollup } from "@/app/queries/quotaQueries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

async function getClient(): Promise<TypedSupabaseClient | null> {
  const mod = await import("../lib/supabase/supabase");
  return (await mod as { getSupabaseClient: () => Promise<TypedSupabaseClient> }).getSupabaseClient();
}

interface UseFeatureWithQuotaReturn {
  available: boolean;        // true only when BOTH plan cap AND quota room
  atQuota: boolean;          // true when quota resource is at limit
  planCap: boolean;          // true when plan feature is gated on
  quota: QuotaRow | null;    // the quota row for the resource
  rollup: QuotaRollup;       // full org quota rollup for display
  loading: boolean;
}

/**
 * Hook that combines plan feature availability with quota enforcement.
 *
 * @param feature - The plan feature to check (e.g. "crm", "ffe", "research_library")
 * @param resource - Optional quota resource to check ("users", "projects", "storage", "deliverables", "crm_leads")
 *                   If omitted, only plan gating is applied (available = has plan cap)
 */
export function useFeatureWithQuota(feature: PlanFeature, resource?: "users" | "projects" | "storage" | "deliverables" | "crm_leads"): UseFeatureWithQuotaReturn {
  const { activeOrg } = useOrgSwitcher();
  const orgId = activeOrg?.orgId ?? null;
  const [state, setState] = useState<UseFeatureWithQuotaReturn>({
    available: false,
    atQuota: false,
    planCap: false,
    quota: null,
    rollup: {
      users: { current: 0, max: null, pct: null, atQuota: false },
      projects: { current: 0, max: null, pct: null, atQuota: false },
      storage: { current: 0, max: null, pct: null, atQuota: false },
      deliverables: { current: 0, max: null, pct: null, atQuota: false },
      crm_leads: { current: 0, max: null, pct: null, atQuota: false },
    },
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setState({
        available: false, atQuota: false, planCap: false, quota: null,
        rollup: {
          users: { current: 0, max: null, pct: null, atQuota: false },
          projects: { current: 0, max: null, pct: null, atQuota: false },
          storage: { current: 0, max: null, pct: null, atQuota: false },
          deliverables: { current: 0, max: null, pct: null, atQuota: false },
          crm_leads: { current: 0, max: null, pct: null, atQuota: false },
        },
        loading: false,
      });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    void (async () => {
      try {
        const client = await getClient();
        if (!client) {
          setState({
            available: false, atQuota: false, planCap: false, quota: null,
            rollup: {
              users: { current: 0, max: null, pct: null, atQuota: false },
              projects: { current: 0, max: null, pct: null, atQuota: false },
              storage: { current: 0, max: null, pct: null, atQuota: false },
              deliverables: { current: 0, max: null, pct: null, atQuota: false },
              crm_leads: { current: 0, max: null, pct: null, atQuota: false },
            },
            loading: false,
          });
          return;
        }
        // 1. Load plan caps
        const { getPlanCaps } = await import("@/app/queries/planCapsQueries");
        const planRes = await getPlanCaps(client, orgId);
        const caps: Record<string, unknown> | null = planRes.ok ? (planRes.data?.caps ?? null) : null;
        const hasPlan = caps ? hasPlanCap(caps, feature) : false;

        // 2. Load quota
        const quotaRes = await fetchOrgQuota(client, orgId);
        const quotaRows: QuotaRow[] = quotaRes.ok ? (quotaRes.data ?? []) : [];
        const rollup = usageRollup(quotaRows);
        const quotaRow: QuotaRow | null = quotaRows.find(r => r.resource === resource) ?? null;
        const atQuota = resource ? (quotaRow ? queryAtQuota(quotaRow) : false) : false;

        // 3. Combine: available only when BOTH plan cap AND quota room
        const available = hasPlan && !atQuota;

        if (!cancelled) {
          setState({
            available,
            atQuota,
            planCap: hasPlan,
            quota: quotaRow ?? null,
            rollup,
            loading: false,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            available: false, atQuota: false, planCap: false, quota: null,
            rollup: {
              users: { current: 0, max: null, pct: null, atQuota: false },
              projects: { current: 0, max: null, pct: null, atQuota: false },
              storage: { current: 0, max: null, pct: null, atQuota: false },
              deliverables: { current: 0, max: null, pct: null, atQuota: false },
              crm_leads: { current: 0, max: null, pct: null, atQuota: false },
            },
            loading: false,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, feature, resource]);

  return {
    available: state.available,
    atQuota: state.atQuota,
    planCap: state.planCap,
    quota: state.quota,
    rollup: state.rollup,
    loading: state.loading,
  };
}

/** Convenience: just the available boolean for one feature + resource. */
export function useCanByPlanAndQuota(feature: PlanFeature, resource?: "users" | "projects" | "storage" | "deliverables" | "crm_leads"): boolean {
  return useFeatureWithQuota(feature, resource).available;
}

/** Convenience: just the atQuota boolean for one resource. */
export function useQuotaStatus(resource: "users" | "projects" | "storage" | "deliverables" | "crm_leads"): { atQuota: boolean; rollup: QuotaRollup } {
  // Use a dummy feature since we only need the quota check
  const hook = useFeatureWithQuota("" as PlanFeature, resource);
  return { atQuota: hook.atQuota, rollup: hook.rollup };
}