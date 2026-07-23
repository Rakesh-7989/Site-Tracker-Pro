const FEATURE_MATRIX: Record<string, Record<string, boolean | number>> = {
  basic: {
    project_count: 1,
    white_label: false,
    real_time: false,
    labour_kiosk: false,
    site_kiosk: false,
    ar_overlay: false,
    material_aggregator: false,
    compliance_checks: true,
    ai_forecast: false,
    api_access: false,
    advanced_audit: false,
    custom_integrations: false,
  },
  pro: {
    project_count: 5,
    white_label: true,
    real_time: true,
    labour_kiosk: true,
    site_kiosk: false,
    ar_overlay: false,
    material_aggregator: true,
    compliance_checks: true,
    ai_forecast: false,
    api_access: false,
    advanced_audit: true,
    custom_integrations: false,
  },
  business: {
    project_count: Infinity,
    white_label: true,
    real_time: true,
    labour_kiosk: true,
    site_kiosk: true,
    ar_overlay: true,
    material_aggregator: true,
    compliance_checks: true,
    ai_forecast: true,
    api_access: true,
    advanced_audit: true,
    custom_integrations: false,
  },
  custom: {
    project_count: Infinity,
    white_label: true,
    real_time: true,
    labour_kiosk: true,
    site_kiosk: true,
    ar_overlay: true,
    material_aggregator: true,
    compliance_checks: true,
    ai_forecast: true,
    api_access: true,
    advanced_audit: true,
    custom_integrations: true,
  },
};

type PlanName = "basic" | "pro" | "business" | "custom";

export function canUseFeature(plan: string, feature: string): boolean | number {
  const row = FEATURE_MATRIX[plan] || FEATURE_MATRIX.basic;
  return row[feature];
}

export function withinProjectQuota(plan: string, currentCount: number): boolean {
  const cap = canUseFeature(plan, "project_count") as number;
  return currentCount < cap;
}

export function requiredPlanFor(feature: string): string {
  for (const plan of ["basic", "pro", "business", "custom"] as PlanName[]) {
    if (canUseFeature(plan, feature)) return plan;
  }
  return "custom";
}

export function upsellLine(currentPlan: string, feature: string): string {
  const need = requiredPlanFor(feature);
  if (need === currentPlan) return "";
  const labels: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };
  return `This requires the ${labels[need] || need} plan. Upgrade from your current ${labels[currentPlan] || currentPlan} plan to unlock.`;
}

export function planFeatureRow(feature: string): Record<string, boolean | number | string> {
  return {
    feature,
    basic: FEATURE_MATRIX.basic[feature],
    pro: FEATURE_MATRIX.pro[feature],
    business: FEATURE_MATRIX.business[feature],
    custom: FEATURE_MATRIX.custom[feature],
  };
}

export function getFeatureMatrix(): Record<string, Record<string, boolean | number>> {
  return JSON.parse(JSON.stringify(FEATURE_MATRIX));
}
