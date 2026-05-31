// SiteTrack Pro — v2 Phase C: per-project-type tab + team templates.
//
// Each project belongs to a `type` (Construction / Interior / Design /
// Consultant). The type drives which tabs are visible inside that project,
// which roles are recommended on the team, and which BOQ presets to load.
//
// This composes WITH the existing feature-flag cascade (Session 16):
//   tab visible ⟺
//     PERMS[user.role].tabs.includes(tab)         (role gate)
//       && featureFlagOn(catalog tab id)          (org flag gate — Session 16)
//       && isTabApplicableToProjectType(type, tab) (type gate — this lib)
//
// All logic is PURE — no React, no state. Testable in isolation.

import { PROJECT_TYPE_IDS, DEFAULT_PROJECT_TYPE } from "../data/lookups.js";

/**
 * Per-type tab visibility config.
 *
 * Each entry lists which DetailView sub-tabs the type makes available.
 * Tabs NOT in the list are hidden regardless of role / flags.
 *
 * Reference: docs/ROLE_MODEL_V2.md section 1.
 */
export const TYPE_TABS = {
  construction: [
    "overview", "milestones", "tasks", "updates", "issues", "punchlist",
    "materials", "ledger", "boq", "estimate", "drawings", "rfi", "changeorders",
    "fieldops", "approvals", "inspections", "safety", "team", "attendance",
    "budget", "po", "invoices", "labour", "rabills", "map", "ai", "gantt",
  ],
  interior: [
    "overview", "milestones", "tasks", "updates", "issues",
    "materials", "drawings", "rfi", "changeorders",
    "fieldops", "approvals", "inspections", "safety",
    "team", "map", "ai",
  ],
  design: [
    "overview", "milestones", "updates", "drawings", "rfi", "changeorders", "ai",
  ],
  consultant: [
    "overview", "milestones", "updates", "drawings", "rfi", "ai",
  ],
};

/**
 * Per-type recommended team roles.
 * Used by the CreateView + OnboardingWizard to suggest default invites.
 */
export const TYPE_TEAM_TEMPLATES = {
  construction: [
    { role: "project_head",   required: true,  desc: "Project lead — single accountable owner" },
    { role: "architect",      required: true,  desc: "Senior architect — design + permits" },
    { role: "mep_consultant", required: false, desc: "Mechanical / Electrical / Plumbing consultant" },
    { role: "site_engineer",  required: true,  desc: "Daily execution + field-ops" },
    { role: "civil_engineer", required: false, desc: "Structural design verification" },
    { role: "site_inspector", required: false, desc: "Quality + statutory inspections" },
    { role: "contractor",     required: true,  desc: "Main contractor (parent of sub-contractors)" },
    { role: "client",         required: true,  desc: "End client — read-only view" },
  ],
  interior: [
    { role: "design_architect_interior", required: true,  desc: "Lead designer with architect background (DA)" },
    { role: "architect",                 required: false, desc: "Permits liaison if required" },
    { role: "interior_designer",         required: true,  desc: "Interior decoration + fit-out designer" },
    { role: "site_engineer",             required: true,  desc: "Site supervision" },
    { role: "contractor",                required: true,  desc: "Fit-out contractor" },
    { role: "client",                    required: true,  desc: "End client" },
  ],
  design: [
    { role: "architect", required: true,  desc: "Project architect" },
    { role: "designer",  required: true,  desc: "3D / detailing designer" },
    { role: "client",    required: true,  desc: "End client" },
  ],
  consultant: [
    { role: "architect",  required: true,  desc: "Architect liaison" },
    { role: "consultant", required: true,  desc: "Specialist consultant (structural / MEP / vastu / etc.)" },
    { role: "client",     required: true,  desc: "End client" },
  ],
};

/**
 * Default BOQ category presets per type. BOQ tab uses these to pre-populate
 * line items when a new project is created. Empty list = no presets.
 */
export const TYPE_BOQ_PRESETS = {
  construction: ["Civil", "MEP", "Finishing", "External", "Other"],
  interior: ["Finishing", "MEP", "Other"],
  design: [],
  consultant: [],
};

// ── Resolver helpers ──────────────────────────────────────────────────────

/** Normalise an arbitrary project.type to a known type id (falls back to default). */
export function projectTypeOf(project) {
  if (!project) return DEFAULT_PROJECT_TYPE;
  if (PROJECT_TYPE_IDS.includes(project.type)) return project.type;
  return DEFAULT_PROJECT_TYPE;
}

/** True when the given tab id is applicable to the project's type. */
export function isTabApplicableToProjectType(typeOrProject, tabId) {
  const type = typeof typeOrProject === "string"
    ? typeOrProject
    : projectTypeOf(typeOrProject);
  const tabs = TYPE_TABS[type];
  if (!tabs) return true; // unknown type → fail open (don't hide tabs)
  return tabs.includes(tabId);
}

/** Returns the recommended team for a project type — used by CreateView. */
export function recommendedTeam(type) {
  const t = PROJECT_TYPE_IDS.includes(type) ? type : DEFAULT_PROJECT_TYPE;
  return TYPE_TEAM_TEMPLATES[t] || [];
}

/** Returns BOQ category presets for a project type. */
export function boqPresets(type) {
  const t = PROJECT_TYPE_IDS.includes(type) ? type : DEFAULT_PROJECT_TYPE;
  return TYPE_BOQ_PRESETS[t] || [];
}

/**
 * Compose all three gates in one call.
 *
 * isTabVisible(user, project, tabId, { isFeatureOn })
 *
 *  isFeatureOn: optional fn (catalogTabId) => boolean — wire to
 *  orgFeatureFlags.isFeatureEnabled at the call site so this lib stays pure.
 *
 * Returns true when:
 *   - role permits the tab
 *   - feature flag (if provided) is on
 *   - project type permits the tab
 */
export function isTabVisible(user, project, tabId, opts = {}) {
  if (!user || !project) return false;
  const roleTabs = (opts.roleTabs) || [];
  if (!roleTabs.includes(tabId)) return false;
  if (typeof opts.isFeatureOn === "function" && !opts.isFeatureOn(tabId)) return false;
  if (!isTabApplicableToProjectType(project, tabId)) return false;
  return true;
}

/** True if a tab is hidden for this project type specifically (not role / flag). */
export function tabHiddenByType(type, tabId) {
  return !isTabApplicableToProjectType(type, tabId);
}

/** Returns a human label + emoji for the type chip in UIs. */
export function typeChip(type) {
  switch (type) {
    case "construction": return { label: "Construction", icon: "🏗️" };
    case "interior":     return { label: "Interior",     icon: "🛋️" };
    case "design":       return { label: "Design",       icon: "✏️" };
    case "consultant":   return { label: "Consultant",   icon: "💡" };
    default:             return { label: "Project",      icon: "📁" };
  }
}
