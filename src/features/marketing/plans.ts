// SiteTrack Pro — public plan tiers for the landing + signup pages.
//
// Pricing model: each tier has a real monthly price and an annual price billed
// yearly. Annual = "2 months free" (annual ≈ monthly × 10 ⇒ ~17% off) — the
// savings are surfaced as a marketing hook (effective monthly + ₹ saved + %).
//
// The plan `id` must stay one of basic/pro/business/custom (matches the
// signup_requests + plans table). Keep these numbers in sync with migration
// 93_plans_pricing_2026.sql (the DB plans table).

import type { SignupPlan } from "@/app/signupQueries";

export type BillingPeriod = "monthly" | "annual";

export interface PlanTier {
  id: SignupPlan;
  name: string;
  monthly: number; // ₹ / month, when billed monthly
  annual: number;  // ₹ / year,  when billed annually (≈ monthly × 10)
  tagline: string;
  features: string[];
  popular?: boolean;
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "basic",
    name: "Basic",
    monthly: 5999,
    annual: 59990,
    tagline: "Small contractors getting organised",
    features: ["Up to 5 team members", "3 active projects", "Daily progress reports (DPR)", "Materials + attendance", "Issues + punch lists"],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 11999,
    annual: 119990,
    tagline: "Growing firms running multiple sites",
    features: ["Up to 20 members", "Unlimited projects", "Finance — POs, invoices, RA bills", "Approval chains", "RERA / GST compliance tracking", "Drawings + RFIs"],
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    monthly: 19999,
    annual: 199990,
    tagline: "Established builders who need control",
    features: ["Up to 100 members", "Everything in Pro", "Custom roles & permissions", "Integrations (WhatsApp, payments)", "Org-wide audit trail", "Priority support"],
  },
];

/** ₹ with Indian digit grouping, no decimals. e.g. 199990 → "₹1,99,990". */
export function formatINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** India GST on SaaS. Listed prices are EXCLUSIVE of GST (B2B claims input credit). */
export const GST_RATE = 0.18;

/** GST-inclusive total for a listed (pre-GST) amount, rounded to whole rupees. */
export function gstInclusive(n: number): number {
  return Math.round(n * (1 + GST_RATE));
}

export interface PriceView {
  amount: string;             // headline price, e.g. "₹7,999" or "₹79,990"
  cadence: string;            // "/month" or "/year"
  /** annual only — the marketing hooks */
  effectiveMonthly?: string;  // e.g. "₹6,666/mo billed annually"
  savingsAmount?: string;     // e.g. "₹15,998"
  savingsPct?: number;        // e.g. 17
}

/** Resolve the display price for a tier under the chosen billing period. */
export function priceFor(tier: PlanTier, period: BillingPeriod): PriceView {
  if (period === "monthly") {
    return { amount: formatINR(tier.monthly), cadence: "/month" };
  }
  const fullYear = tier.monthly * 12;
  const savings = fullYear - tier.annual;
  const pct = fullYear > 0 ? Math.round((savings / fullYear) * 100) : 0;
  return {
    amount: formatINR(tier.annual),
    cadence: "/year",
    effectiveMonthly: `${formatINR(tier.annual / 12)}/mo billed annually`,
    savingsAmount: formatINR(savings),
    savingsPct: pct,
  };
}
