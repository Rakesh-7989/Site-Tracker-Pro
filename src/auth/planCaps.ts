// SiteTrack Pro — plan capability model (plan-gating, 2026-06-06).
//
// Plan gating is ORTHOGONAL to role gating:
//   • permissions-matrix.ts (RBAC) decides what a USER ROLE may do.
//   • plan feature_caps (this file) decides what the ORG's PLAN unlocks.
// A feature is available only when BOTH allow it.
//
// feature_caps live on the `plans` table (migration 96). This module is the
// pure, testable read-side: given a caps object, answer "does this plan unlock
// feature X" + "what's the numeric limit". Fetching happens in
// app/planCapsQueries.ts; the React hook is auth/usePlanCaps.ts.

/** Boolean plan features (keys in plans.feature_caps). */
export type PlanFeature =
  | "whatsapp_share"
  | "hierarchy" | "finance" | "approvals" | "drawings_write" | "rfi"
  | "compliance_read" | "estimate" | "gantt" | "esign" | "material_aggregator"
  | "custom_roles" | "audit_unlimited" | "audit_export"
  | "rera_filing" | "gstn_filing" | "epfo_filing"
  | "whatsapp_send" | "dpr_auto" | "cashfree_payments"
  | "kiosks" | "ar_overlay" | "ai_forecast" | "priority_support";

/** Numeric plan limits (null = unlimited). */
export type PlanLimit = "users_max" | "projects_max" | "projects_ceiling" | "storage_gb" | "audit_days";

export interface PlanCaps {
  plan: string;
  /** Raw feature_caps JSON from the plans row. */
  caps: Record<string, unknown>;
}

/** True only when the plan explicitly unlocks the feature. Missing/unknown → false (deny by default). */
export function hasPlanCap(caps: Record<string, unknown> | null | undefined, feature: PlanFeature): boolean {
  return !!caps && caps[feature] === true;
}

/** Numeric limit, or null for unlimited / unknown. */
export function planLimit(caps: Record<string, unknown> | null | undefined, key: PlanLimit): number | null {
  if (!caps) return null;
  const v = caps[key];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The lowest plan that unlocks each feature — used for upsell copy ("Available on Pro"). */
export const FEATURE_MIN_PLAN: Record<PlanFeature, string> = {
  whatsapp_share: "basic",
  hierarchy: "pro", finance: "pro", approvals: "pro", drawings_write: "pro", rfi: "pro",
  compliance_read: "pro", estimate: "pro", gantt: "pro", esign: "pro", material_aggregator: "pro",
  custom_roles: "business", audit_unlimited: "business", audit_export: "business",
  rera_filing: "business", gstn_filing: "business", epfo_filing: "business",
  whatsapp_send: "business", dpr_auto: "business", cashfree_payments: "business",
  kiosks: "business", ar_overlay: "business", ai_forecast: "business", priority_support: "business",
};

/** Human labels for upsell cards. */
export const PLAN_FEATURE_LABEL: Record<PlanFeature, string> = {
  whatsapp_share: "WhatsApp share",
  hierarchy: "Block / Floor / Unit hierarchy", finance: "Finance (POs, invoices, RA bills)",
  approvals: "Approval chains", drawings_write: "Drawing upload & release", rfi: "RFIs & change orders",
  compliance_read: "Compliance dashboard", estimate: "Estimates", gantt: "Gantt timeline",
  esign: "e-Signature", material_aggregator: "Material price aggregator",
  custom_roles: "Custom roles", audit_unlimited: "Full audit log", audit_export: "Audit CSV export",
  rera_filing: "RERA filing", gstn_filing: "GSTN e-invoice", epfo_filing: "EPFO filing",
  whatsapp_send: "Automated WhatsApp send", dpr_auto: "Automated DPR (6 PM)",
  cashfree_payments: "Cashfree payments", kiosks: "Site & labour kiosks", ar_overlay: "AR drawing overlay",
  ai_forecast: "AI cost forecast", priority_support: "Priority support",
};

export const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, business: 3, enterprise: 4, custom: 4 };
