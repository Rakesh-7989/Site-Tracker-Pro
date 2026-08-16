// SiteTrack Pro — fetch the active org's plan + feature_caps for plan gating.

import type { PlanCaps } from "@/auth/planCaps";

export type PlanCapsResult = { ok: true; data: PlanCaps } | { ok: false; error: string };

/** Minimal subscription row shape the trial check reads. */
export interface SubscriptionBrief {
  status: string;
  trial_ends_at: string | null;
}

/**
 * §5.5a — resolve the *effective* plan from the subscription row:
 * - `status='trial'` AND `trial_ends_at` in the future → treat as `'pro'`
 *   (full Pro during the trial, regardless of `organizations.plan`);
 * - otherwise (expired trial, active/pending/past_due/cancelled, or no row)
 *   → fall back to `organizations.plan` (the owner's choice or `'basic'`).
 */
export function resolveEffectivePlan(orgPlan: string, sub: SubscriptionBrief | null, now: Date = new Date()): string {
  if (sub && sub.status === "trial" && sub.trial_ends_at) {
    const end = new Date(sub.trial_ends_at).getTime();
    if (Number.isFinite(end) && end > now.getTime()) return "pro";
  }
  return orgPlan;
}

/** True while the org is inside an active (non-expired) Pro trial. */
export function isTrialActive(sub: SubscriptionBrief | null, now: Date = new Date()): boolean {
  return sub?.status === "trial" && !!sub.trial_ends_at && resolveEffectivePlan("basic", sub, now) === "pro";
}

/**
 * Read organizations.plan + the joined plans.feature_caps for one org.
 * RLS lets a member read their own org row; plans is publicly readable.
 * The `subscriptions` read is admin/superadmin-only (migration 82), so a
 * non-admin member gets `null` there and falls back to `organizations.plan`
 * (which the trial-end cron keeps in sync) — the read-side check is an
 * additive correctness layer, never a source of errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPlanCaps(client: any, orgId: string): Promise<PlanCapsResult> {
  try {
    const { data: org, error: orgErr } = await client
      .from("organizations").select("plan").eq("id", orgId).single();
    if (orgErr) return { ok: false, error: String(orgErr.message ?? orgErr) };
    const plan = String(org?.plan ?? "basic");

    let sub: SubscriptionBrief | null = null;
    const subRes = await client
      .from("subscriptions").select("status, trial_ends_at").eq("org_id", orgId).maybeSingle();
    if (subRes && !subRes.error && subRes.data) sub = subRes.data as SubscriptionBrief;

    const effective = resolveEffectivePlan(plan, sub);
    const { data: planRow, error: planErr } = await client
      .from("plans").select("feature_caps").eq("id", effective).single();
    if (planErr) return { ok: false, error: String(planErr.message ?? planErr) };
    const caps = (planRow?.feature_caps ?? {}) as Record<string, unknown>;
    const trialActive = isTrialActive(sub);
    return {
      ok: true,
      data: { plan: effective, caps, trialActive, trialEndsAt: trialActive ? (sub?.trial_ends_at ?? null) : null },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}