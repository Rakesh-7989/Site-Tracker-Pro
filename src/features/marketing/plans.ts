// SiteTrack Pro — public plan tiers for the landing + signup pages.
//
// NOTE: prices here are display placeholders for the marketing page — adjust to
// your real pricing (or wire to the `plans` table) when finalised. The plan
// `id` must stay one of basic/pro/business/custom (matches signup_requests).

import type { SignupPlan } from "@/app/signupQueries";

export interface PlanTier {
  id: SignupPlan;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  popular?: boolean;
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "basic",
    name: "Basic",
    price: "₹2,999",
    cadence: "/month",
    tagline: "Small contractors getting organised",
    features: ["Up to 5 team members", "3 active projects", "Daily progress reports (DPR)", "Materials + attendance", "Issues + punch lists"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹7,999",
    cadence: "/month",
    tagline: "Growing firms running multiple sites",
    features: ["Up to 20 members", "Unlimited projects", "Finance — POs, invoices, RA bills", "Approval chains", "RERA / GST compliance tracking", "Drawings + RFIs"],
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    price: "₹19,999",
    cadence: "/month",
    tagline: "Established builders who need control",
    features: ["Up to 100 members", "Everything in Pro", "Custom roles & permissions", "Integrations (WhatsApp, payments)", "Org-wide audit trail", "Priority support"],
  },
];
