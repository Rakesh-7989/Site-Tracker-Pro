// SiteTrack Pro — AI feature recommender.
//
// Tracks per-org feature touch counts over a rolling 30-day window and
// produces:
//   - "Disable" recommendations for features whose touch-count is 0 (or near
//     0), to declutter the UI for that org.
//   - "Upgrade" nudges where high-engagement features are gated behind a plan
//     the org doesn't have.
//   - "Onboarding" nudges where a flagship feature has been ON but never
//     touched (suggests the user doesn't know it exists).
//
// Pure-function, no LLM hits required. An optional async `narrate()` wraps
// the structured suggestion in a friendly sentence (Telugu/Hindi/English).

const DEFAULT_WINDOW_DAYS = 30;
const ZERO_TOUCH_THRESHOLD = 2;          // <= 2 touches in 30d ⇒ "unused"
const HIGH_TOUCH_THRESHOLD = 25;         // >= 25 touches ⇒ "loved"

/**
 * Build per-feature touch counts from a stream of recordAudit() rows.
 *
 * Each row: { ts, resource, action, org_id }.
 * We tally by `resource` — the resource name lines up with a feature key
 * via FEATURE_CATALOG (passed in to avoid a hard import dependency).
 */
export function buildUsage(auditRows, { now = new Date(), windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const since = +now - windowDays * 24 * 3600 * 1000;
  const counts = new Map();
  for (const r of auditRows ?? []) {
    if (!r || !r.ts) continue;
    const ts = +new Date(r.ts);
    if (Number.isNaN(ts) || ts < since) continue;
    const key = String(r.resource || "");
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

/**
 * Map a resource name (the audit_log_v2.resource column) → feature key.
 * The catalog defines the canonical 37 feature keys; we use a simple alias
 * table for resources that don't share the exact name.
 */
const RESOURCE_ALIAS = {
  ra_bill: "tab_ra",
  boq_item: "tab_bo",
  drawing: "tab_drawings",
  inspection: "tab_quality",
  safety: "tab_safety",
  measurement_book: "tab_mb",
  labour_register: "tab_labour",
  approval_chain: "workflow_approvals",
  delegation: "workflow_delegations",
  template: "workflow_templates",
  notification_rule: "workflow_notifications",
  feature_flag: "orgadmin_feature_settings",
  branding: "orgadmin_branding",
  subscription: "orgadmin_billing",
  org_integration: "orgadmin_integrations",
};

function resourceToFeatureKey(resource) {
  if (!resource) return null;
  if (RESOURCE_ALIAS[resource]) return RESOURCE_ALIAS[resource];
  // Heuristic: prefix-match against tab_ keys.
  return `tab_${resource}`;
}

/**
 * Generate suggestions for a single org.
 *
 * Inputs:
 *   - catalog: FEATURE_CATALOG (array of { key, label, group, requiresPlan? }).
 *   - usage: result of buildUsage().
 *   - orgFlags: { [key]: bool } current per-org overrides.
 *   - orgPlan: 'basic' | 'pro' | 'business' | 'custom'.
 *
 * Returns an array of { type, featureKey, label, rationale, severity }.
 */
export function suggestForOrg(catalog, usage, orgFlags, orgPlan) {
  const out = [];
  const enabled = (key) => (orgFlags?.[key] !== undefined ? !!orgFlags[key] : true);
  const planRank = (p) => ["basic", "pro", "business", "custom"].indexOf(p || "basic");

  for (const feat of catalog ?? []) {
    const count = usage?.[feat.key] ?? 0;
    const isOn = enabled(feat.key);

    // 1. Unused while ON: suggest "consider disabling".
    if (isOn && count <= ZERO_TOUCH_THRESHOLD) {
      out.push({
        type: "disable",
        featureKey: feat.key,
        label: feat.label,
        rationale: count === 0
          ? "No activity in the last 30 days."
          : `Only ${count} interaction(s) in the last 30 days.`,
        severity: "low",
      });
      continue;
    }

    // 2. Loved while ON: positive signal — surface in a "what's working" panel.
    if (isOn && count >= HIGH_TOUCH_THRESHOLD) {
      out.push({
        type: "celebrate",
        featureKey: feat.key,
        label: feat.label,
        rationale: `${count} interactions in the last 30 days.`,
        severity: "info",
      });
    }

    // 3. Gated behind a higher plan AND showing engagement on a free preview
    //    surface: prompt for upgrade.
    if (
      isOn
      && feat.requiresPlan
      && planRank(orgPlan) < planRank(feat.requiresPlan)
      && count >= 1
    ) {
      out.push({
        type: "upgrade",
        featureKey: feat.key,
        label: feat.label,
        rationale: `Available on ${feat.requiresPlan}. ${count} preview interaction(s) detected.`,
        severity: "medium",
      });
    }
  }

  // Sort: upgrades first (revenue), then disables (declutter), then celebrate.
  out.sort((a, b) => weight(a) - weight(b));
  return out;
}

function weight(s) {
  if (s.type === "upgrade") return 0;
  if (s.type === "disable") return 1;
  return 2;
}

/**
 * Group suggestions by type, returning a tidy object for the UI.
 */
export function groupSuggestions(suggestions) {
  return {
    upgrade: (suggestions ?? []).filter(s => s.type === "upgrade"),
    disable: (suggestions ?? []).filter(s => s.type === "disable"),
    celebrate: (suggestions ?? []).filter(s => s.type === "celebrate"),
  };
}

/**
 * Friendly multi-language narration. Falls back to English when a translation
 * is missing. (Telugu/Hindi strings deliberately kept brief — UI does the
 * heavy lift, this is a one-liner per suggestion.)
 */
const NARRATE = {
  en: {
    disable: (s) => `Consider hiding "${s.label}" — ${s.rationale}`,
    upgrade: (s) => `"${s.label}" needs the ${s.rationale.match(/Available on (\w+)/)?.[1] || "higher"} plan — ${s.rationale}`,
    celebrate: (s) => `"${s.label}" is being used well — ${s.rationale}`,
  },
  te: {
    disable: (s) => `"${s.label}" hide cheyandi — ${s.rationale}`,
    upgrade: (s) => `"${s.label}" ki plan upgrade kavali — ${s.rationale}`,
    celebrate: (s) => `"${s.label}" baga vadukuntunnaru — ${s.rationale}`,
  },
  hi: {
    disable: (s) => `"${s.label}" ko chhupayen — ${s.rationale}`,
    upgrade: (s) => `"${s.label}" ke liye plan upgrade karen — ${s.rationale}`,
    celebrate: (s) => `"${s.label}" achhe se istemal ho raha hai — ${s.rationale}`,
  },
};

export function narrate(suggestion, lang = "en") {
  if (!suggestion) return "";
  const dict = NARRATE[lang] || NARRATE.en;
  const fn = dict[suggestion.type] || dict.disable;
  return fn(suggestion);
}

// Exposed for tests.
export const _internal = {
  resourceToFeatureKey,
  ZERO_TOUCH_THRESHOLD,
  HIGH_TOUCH_THRESHOLD,
};
