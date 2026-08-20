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

import { Card, Icon, Badge, Spinner } from "@/components/ui/atoms";
import { usePlanCaps } from "./usePlanCaps";
import { PLAN_FEATURE_LABEL, FEATURE_MIN_PLAN, type PlanFeature } from "./planCaps";

const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", enterprise: "Enterprise", custom: "Enterprise" };

export function PlanGate({ feature, children, fallback }: { feature: PlanFeature; children: ReactNode; fallback?: ReactNode }): JSX.Element {
  const { can, loading } = usePlanCaps();
  // SEC-05 fail-closed: while plan caps load we render a neutral placeholder —
  // never children (would grant before the caps are known) and never the
  // upsell card (would flash "upgrade" at a legitimately-entitled user).
  if (loading) return <PlanGateLoading label={PLAN_FEATURE_LABEL[feature]} />;
  if (can(feature)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  const needs = PLAN_LABEL[FEATURE_MIN_PLAN[feature]] ?? "a higher";
  return (
    <Card className="p-6 border-warning bg-warning-tint/60 text-center max-w-md mx-auto">
      <div className="w-11 h-11 rounded-xl bg-warning-tint text-warning grid place-items-center mx-auto mb-3"><Icon name="lock" size={20} /></div>
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="font-semibold text-fg-primary">{PLAN_FEATURE_LABEL[feature]}</span>
        <Badge tone="warning">{needs}</Badge>
      </div>
      <p className="text-sm text-fg-secondary">This feature is available on the <b>{needs}</b> plan and above.</p>
      <Link to="/org/billing" className="inline-block mt-4 text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-4 py-2 rounded-lg transition">
        View plans & upgrade →
      </Link>
    </Card>
  );
}

/** Neutral "checking plan" placeholder — the fail-closed loading state. */
function PlanGateLoading({ label }: { label: string }): JSX.Element {
  return (
    <Card className="p-6 text-center max-w-md mx-auto">
      <div className="flex items-center justify-center gap-2 text-fg-secondary text-sm">
        <Spinner size={16} />
        <span>Checking {label} on your plan…</span>
      </div>
    </Card>
  );
}
