// SiteTrack Pro — self-serve plan purchase (Razorpay one-time links).
//
// Thin client over the `razorpay-plan-link` Edge Function. The orgadmin picks
// a plan + period, we mint a platform-level Razorpay payment link, the payer
// completes it in a new tab, and the webhook activates the plan
// (organizations.plan + subscriptions + billing_history). Gateway secrets
// never reach the browser — only the shareable link URL comes back.

import type { TypedSupabaseClient } from "@/lib/supabase/db";

export async function createPlanPaymentLink(
  client: TypedSupabaseClient,
  orgId: string,
  plan: string,
  period: "monthly" | "annual",
): Promise<
  | { ok: true; data: { linkUrl: string; linkId: string; amount: number } }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await client.functions.invoke("razorpay-plan-link", {
      body: { org_id: orgId, plan, period },
    });
    if (error) {
      let msg = String(error.message ?? "Payment link creation failed.");
      try { const b = await error.context.json(); msg = b.message || b.error || msg; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    if (!data?.ok || !data?.linkUrl) {
      return { ok: false, error: String(data?.message ?? data?.error ?? "Payment link creation failed.") };
    }
    return {
      ok: true,
      data: {
        linkUrl: String(data.linkUrl),
        linkId: String(data.linkId ?? ""),
        amount: Number(data.amount ?? 0),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
