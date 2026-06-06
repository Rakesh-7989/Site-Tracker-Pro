// SiteTrack Pro — <PlanGate>: render children only if the active org's plan
// unlocks the feature; otherwise show a soft upsell card.
//
//   <PlanGate feature="finance"><FinanceTab /></PlanGate>
//
// Soft by design: hides the UI + offers an upgrade path. Hard enforcement for
// dangerous/paid actions (RERA/GSTN/WhatsApp/Cashfree) is server-side
// (supabase/functions/_shared/planCheck.ts).

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Card, Icon, Badge } from "@/components/ui/atoms";
import { usePlanCaps } from "./usePlanCaps";
import { PLAN_FEATURE_LABEL, FEATURE_MIN_PLAN, type PlanFeature } from "./planCaps";

const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", enterprise: "Enterprise", custom: "Enterprise" };

export function PlanGate({ feature, children, fallback }: { feature: PlanFeature; children: ReactNode; fallback?: ReactNode }): JSX.Element {
  const { can, loading } = usePlanCaps();
  if (loading || can(feature)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  const needs = PLAN_LABEL[FEATURE_MIN_PLAN[feature]] ?? "a higher";
  return (
    <Card className="p-6 border-amber-200 bg-amber-50/60 text-center max-w-md mx-auto">
      <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 grid place-items-center mx-auto mb-3"><Icon name="lock" size={20} /></div>
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="font-semibold text-ink-900">{PLAN_FEATURE_LABEL[feature]}</span>
        <Badge tone="warning">{needs}</Badge>
      </div>
      <p className="text-sm text-ink-600">This feature is available on the <b>{needs}</b> plan and above.</p>
      <Link to="/org/billing" className="inline-block mt-4 text-sm font-semibold text-white bg-safety-500 hover:bg-safety-600 px-4 py-2 rounded-lg transition">
        View plans & upgrade →
      </Link>
    </Card>
  );
}
