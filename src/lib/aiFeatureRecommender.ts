const DEFAULT_WINDOW_DAYS = 30;
const ZERO_TOUCH_THRESHOLD = 2;
const HIGH_TOUCH_THRESHOLD = 25;

interface AuditRow {
  ts?: string;
  resource?: string;
  [key: string]: unknown;
}

interface UsageOpts {
  now?: Date;
  windowDays?: number;
}

interface Suggestion {
  type: string;
  featureKey: string;
  label: string;
  rationale: string;
  severity: string;
}

interface CatalogEntry {
  key: string;
  label: string;
  group?: string;
  requiresPlan?: string;
  [key: string]: unknown;
}

interface GroupedSuggestions {
  upgrade: Suggestion[];
  disable: Suggestion[];
  celebrate: Suggestion[];
}

export function buildUsage(auditRows: AuditRow[], { now = new Date(), windowDays = DEFAULT_WINDOW_DAYS }: UsageOpts = {}): Record<string, number> {
  const since = +now - windowDays * 24 * 3600 * 1000;
  const counts = new Map<string, number>();
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

const RESOURCE_ALIAS: Record<string, string> = {
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

function resourceToFeatureKey(resource: string): string | null {
  if (!resource) return null;
  if (RESOURCE_ALIAS[resource]) return RESOURCE_ALIAS[resource];
  return `tab_${resource}`;
}

export function suggestForOrg(catalog: CatalogEntry[], usage: Record<string, number>, orgFlags: Record<string, boolean>, orgPlan: string): Suggestion[] {
  const out: Suggestion[] = [];
  const enabled = (key: string) => (orgFlags?.[key] !== undefined ? !!orgFlags[key] : true);
  const planRank = (p: string) => ["basic", "pro", "business", "custom"].indexOf(p || "basic");

  for (const feat of catalog ?? []) {
    const count = usage?.[feat.key] ?? 0;
    const isOn = enabled(feat.key);

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

    if (isOn && count >= HIGH_TOUCH_THRESHOLD) {
      out.push({
        type: "celebrate",
        featureKey: feat.key,
        label: feat.label,
        rationale: `${count} interactions in the last 30 days.`,
        severity: "info",
      });
    }

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

  out.sort((a, b) => weight(a) - weight(b));
  return out;
}

function weight(s: Suggestion): number {
  if (s.type === "upgrade") return 0;
  if (s.type === "disable") return 1;
  return 2;
}

export function groupSuggestions(suggestions: Suggestion[]): GroupedSuggestions {
  return {
    upgrade: (suggestions ?? []).filter(s => s.type === "upgrade"),
    disable: (suggestions ?? []).filter(s => s.type === "disable"),
    celebrate: (suggestions ?? []).filter(s => s.type === "celebrate"),
  };
}

const NARRATE: Record<string, Record<string, (s: Suggestion) => string>> = {
  en: {
    disable: (s) => `Consider hiding "${s.label}" — ${s.rationale}`,
    upgrade: (s) => `"${s.label}" needs the ${(s.rationale.match(/Available on (\w+)/)?.[1]) || "higher"} plan — ${s.rationale}`,
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

export function narrate(suggestion: Suggestion, lang = "en"): string {
  if (!suggestion) return "";
  const dict = NARRATE[lang] || NARRATE.en;
  const fn = dict[suggestion.type] || dict.disable;
  return fn(suggestion);
}

export const _internal = {
  resourceToFeatureKey,
  ZERO_TOUCH_THRESHOLD,
  HIGH_TOUCH_THRESHOLD,
};
