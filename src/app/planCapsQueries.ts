// SiteTrack Pro — fetch the active org's plan + feature_caps for plan gating.

import type { PlanCaps } from "@/auth/planCaps";

export type PlanCapsResult = { ok: true; data: PlanCaps } | { ok: false; error: string };

/**
 * Read organizations.plan + the joined plans.feature_caps for one org.
 * RLS lets a member read their own org row; plans is publicly readable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPlanCaps(client: any, orgId: string): Promise<PlanCapsResult> {
  try {
    const { data: org, error: orgErr } = await client
      .from("organizations").select("plan").eq("id", orgId).single();
    if (orgErr) return { ok: false, error: String(orgErr.message ?? orgErr) };
    const plan = String(org?.plan ?? "basic");
    const { data: planRow, error: planErr } = await client
      .from("plans").select("feature_caps").eq("id", plan).single();
    if (planErr) return { ok: false, error: String(planErr.message ?? planErr) };
    const caps = (planRow?.feature_caps ?? {}) as Record<string, unknown>;
    return { ok: true, data: { plan, caps } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
