// SiteTrack Pro — cashfree self-serve plan-payment link query layer.
//
// Thin client over the `cashfree-plan-link` Edge Function. Cashfree keys NEVER
// reach the browser: the EF validates org/plan/period, creates a hosted link
// via the Cashfree PG API and returns the shareable payment_session_url. The
// webhook writes `plan_payments` + activates the plan; the paying page just
// shows `?paid=1`.

import type { UResult } from "./upgradeQueries";

export type PlanPaymentPeriod = "monthly" | "annual";

export interface PlanPaymentLink {
  linkUrl: string;
  linkId: string;
  amount: number;
  env: string;
}

export interface MintPlanPaymentLinkArgs {
  orgId: string;
  plan: string;
  period: PlanPaymentPeriod;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mintPlanPaymentLink(client: any, args: MintPlanPaymentLinkArgs): Promise<UResult<PlanPaymentLink>> {
  try {
    const { data, error } = await client.functions.invoke("cashfree-plan-link", {
      body: { org_id: args.orgId, plan: args.plan, period: args.period },
    });
    if (error) {
      let msg = String(error.message ?? "Payment link creation failed.");
      try { const b = await error.context.json(); msg = b.error || b.detail || b.message || msg; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    if (!data?.ok) return { ok: false, error: String(data?.error ?? data?.detail ?? "Payment link creation failed.") };
    return {
      ok: true,
      data: {
        linkUrl: String(data.link_url ?? data.linkUrl ?? ""),
        linkId: String(data.link_id ?? data.linkId ?? ""),
        amount: Number(data.amount ?? 0),
        env: String(data.env ?? "test"),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}