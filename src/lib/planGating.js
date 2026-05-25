// SiteTrack Pro — Plan-based feature gating.
//
// Inspired by HRMS's subscription middleware: prati request lo current tenant's
// plan check chesi premium features ni gate cheyali. Frontend lo same call —
// `canUseFeature(plan, feature)` — `can()` permission helper la pattern.
//
// Plan tiers (mirror src/data/seed.demo.js PLAN_META):
//   basic    — solo / single project, learning the tool
//   pro      — growing builder, 5 projects, white-label
//   business — established firm, unlimited + API + AR + kiosk
//   custom   — enterprise / EPC, everything + dedicated support
//
// Features in the matrix:
//   project_count           — hard cap (number)
//   white_label             — branding cascade (logo, colors)
//   real_time               — WebSocket push updates
//   labour_kiosk            — tablet-on-site clock-in flow
//   site_kiosk              — wall-mounted site display
//   ar_overlay              — phone camera + drawing AR
//   material_aggregator     — live vendor price feed
//   compliance_checks       — RERA/GST/EPFO async verify
//   ai_forecast             — AI cost overrun predictor
//   api_access              — public REST API + webhooks
//   advanced_audit          — server-side immutable audit log with export
//   custom_integrations     — Tally/Zoho/QuickBooks hooks

const FEATURE_MATRIX = {
  basic: {
    project_count: 1,
    white_label: false,
    real_time: false,
    labour_kiosk: false,
    site_kiosk: false,
    ar_overlay: false,
    material_aggregator: false,
    compliance_checks: true,    // RERA/GST checks free — drives adoption
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

/** Boolean / numeric feature lookup. */
export function canUseFeature(plan, feature) {
  const row = FEATURE_MATRIX[plan] || FEATURE_MATRIX.basic;
  return row[feature];
}

/** Check if the org can add ONE more project — used at create-project guard. */
export function withinProjectQuota(plan, currentCount) {
  const cap = canUseFeature(plan, "project_count");
  return currentCount < cap;
}

/** Returns the lowest plan that unlocks `feature` — for upsell CTAs. */
export function requiredPlanFor(feature) {
  for (const plan of ["basic", "pro", "business", "custom"]) {
    if (canUseFeature(plan, feature)) return plan;
  }
  return "custom";
}

/** Friendly upsell line shown when a gated feature is attempted. */
export function upsellLine(currentPlan, feature) {
  const need = requiredPlanFor(feature);
  if (need === currentPlan) return "";
  const labels = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };
  return `This requires the ${labels[need] || need} plan. Upgrade from your current ${labels[currentPlan] || currentPlan} plan to unlock.`;
}

/** Compact feature row for the pricing comparison table. */
export function planFeatureRow(feature) {
  return {
    feature,
    basic: FEATURE_MATRIX.basic[feature],
    pro: FEATURE_MATRIX.pro[feature],
    business: FEATURE_MATRIX.business[feature],
    custom: FEATURE_MATRIX.custom[feature],
  };
}

/** Full matrix snapshot — used by pricing page. */
export function getFeatureMatrix() {
  return JSON.parse(JSON.stringify(FEATURE_MATRIX));
}
