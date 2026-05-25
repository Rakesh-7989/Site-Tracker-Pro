// SiteTrack Pro — Feature Flag Catalog (toggle-driven feature system).
//
// Three layers of control, in cascade order:
//
//   1. PLATFORM (super admin)  — `platformFlags`. The catalog of every feature
//      the product ships. Super admin can disable a feature platform-wide so
//      no org can enable it. Used as the master kill-switch for incident
//      response and for staged rollouts.
//
//   2. ORG (org admin)         — `orgFlags[org_id][featureId] = bool`. Org
//      admin chooses which platform-allowed features their team uses. This
//      is the day-to-day knob.
//
//   3. DEFAULTS + PLAN GATE    — Every catalog entry has a `default` (on/off
//      when no override) and a `plan` (basic / pro / business). A feature
//      is invisible to orgs below the required plan tier.
//
// resolve(flags, orgId, featureId, plan):
//   - returns FALSE if super admin disabled it platform-wide
//   - returns FALSE if the org's plan is below the feature's minimum tier
//   - returns the org override if set, otherwise the feature default
//
// EVERY user-facing surface (Sidebar, DetailView tab list, AR/kiosk
// availability, etc.) should consult this single resolver. That keeps the
// "what can this user see" question in ONE place.

export const FEATURE_GROUPS = ["nav", "tabs", "workflow", "orgadmin"];

const ALL_PLANS = ["basic", "pro", "business", "custom"];
const PLAN_ORDER = { basic: 0, pro: 1, business: 2, custom: 3 };

/**
 * The master catalog. Edit here to add / remove / change defaults for
 * any toggleable feature. Each entry:
 *
 *   id          ↦ stable string used by all consumers + audit log
 *   label       ↦ what the toggle says in the UI
 *   group       ↦ FEATURE_GROUPS for the rendering bucket
 *   plan        ↦ minimum plan tier ("basic"|"pro"|"business")
 *   default     ↦ on/off when no override is set
 *   desc        ↦ one-line explainer shown under the toggle
 *   essential   ↦ true means the toggle is hidden + always on (e.g. dashboard)
 */
export const FEATURE_CATALOG = {
  // ── Top-level nav (sidebar items) ─────────────────────────────────────
  hierarchy:        { id: "hierarchy",        label: "Hierarchy (Block / Floor / Unit)", group: "nav",       plan: "pro",      default: true,  desc: "Multi-level project structure for residential + commercial." },
  calendar:         { id: "calendar",         label: "Calendar",                          group: "nav",       plan: "basic",    default: true,  desc: "Milestone + task + invoice calendar." },
  vendors:          { id: "vendors",          label: "Vendors directory",                 group: "nav",       plan: "basic",    default: true,  desc: "Shared vendor list across all projects." },
  po:               { id: "po",               label: "Purchase Orders",                   group: "nav",       plan: "basic",    default: true,  desc: "Procurement workflow." },
  materialPrices:   { id: "materialPrices",   label: "Material price aggregator",         group: "nav",       plan: "pro",      default: true,  desc: "Live commodity prices from 6 vendor adapters." },
  compliance:       { id: "compliance",       label: "Compliance checks",                 group: "nav",       plan: "pro",      default: true,  desc: "RERA / GSTIN / EPFO / PAN validators." },
  forecast:         { id: "forecast",         label: "AI cost forecast",                  group: "nav",       plan: "business", default: true,  desc: "Deterministic burn-rate + optional LLM narrative." },
  delegations:      { id: "delegations",      label: "Approval delegations",              group: "nav",       plan: "pro",      default: true,  desc: "Out-of-office approver substitution." },
  snapshot:         { id: "snapshot",         label: "Daily snapshot panel",              group: "nav",       plan: "pro",      default: true,  desc: "Frozen daily KPI rows for audit + WoW comparison." },
  kioskLabour:      { id: "kioskLabour",      label: "Labour Attendance Kiosk",           group: "nav",       plan: "business", default: true,  desc: "Tablet-at-entrance attendance flow." },
  kioskSite:        { id: "kioskSite",        label: "Site Wall Kiosk",                   group: "nav",       plan: "business", default: true,  desc: "10-foot situational awareness display." },
  arOverlay:        { id: "arOverlay",        label: "AR Drawing Overlay",                group: "nav",       plan: "business", default: false, desc: "Camera + drawing overlay for as-built (beta)." },
  analytics:        { id: "analytics",        label: "Analytics dashboards",              group: "nav",       plan: "basic",    default: true,  desc: "Cross-project charts + cost burn." },
  activity:         { id: "activity",         label: "Activity feed",                     group: "nav",       plan: "basic",    default: true,  desc: "Project-level audit-style feed." },
  messages:         { id: "messages",         label: "Messages",                          group: "nav",       plan: "basic",    default: true,  desc: "Per-project chat thread." },

  // ── Project-detail tabs ───────────────────────────────────────────────
  tasks:            { id: "tasks",            label: "Tasks tab",                         group: "tabs",      plan: "basic",    default: true,  desc: "Granular tasks under each milestone." },
  punchlist:        { id: "punchlist",        label: "Punch list tab",                    group: "tabs",      plan: "basic",    default: true,  desc: "Closeout snag list with photo evidence." },
  materials:        { id: "materials",        label: "Materials tab",                     group: "tabs",      plan: "basic",    default: true,  desc: "GRN + delivery tracking per project." },
  ledger:           { id: "ledger",           label: "Stock ledger tab",                  group: "tabs",      plan: "basic",    default: true,  desc: "Inward / outward inventory transactions." },
  boq:              { id: "boq",              label: "BOQ tab",                           group: "tabs",      plan: "basic",    default: true,  desc: "Bill of Quantities (Indian construction standard)." },
  estimate:         { id: "estimate",         label: "Estimate tab",                      group: "tabs",      plan: "pro",      default: true,  desc: "Markup / overhead / contingency rollup over BOQ." },
  rfi:              { id: "rfi",              label: "RFI tab",                           group: "tabs",      plan: "basic",    default: true,  desc: "Request for Information workflow." },
  changeorders:     { id: "changeorders",     label: "Change Orders tab",                 group: "tabs",      plan: "basic",    default: true,  desc: "Variations with cost + time impact." },
  fieldops:         { id: "fieldops",         label: "Field Ops (Diary / Equipment / Worklogs)", group: "tabs", plan: "basic",  default: true,  desc: "Site engineer daily ops record." },
  approvals:        { id: "approvals",        label: "Approvals (Submittals / Permits)",  group: "tabs",      plan: "pro",      default: true,  desc: "Submittal + permit lifecycle." },
  inspections:      { id: "inspections",      label: "Inspections tab",                   group: "tabs",      plan: "basic",    default: true,  desc: "Quality inspections with pass/fail items." },
  safety:           { id: "safety",           label: "Safety tab",                        group: "tabs",      plan: "basic",    default: true,  desc: "Near-miss + incident register." },
  rabills:          { id: "rabills",          label: "RA Bills + MB tab",                 group: "tabs",      plan: "basic",    default: true,  desc: "Running Account bills + Measurement Book." },
  labour:           { id: "labour",           label: "Labour register tab",               group: "tabs",      plan: "basic",    default: true,  desc: "Statutory labour register (PII restricted)." },
  ai:               { id: "ai",               label: "AI Insights tab",                   group: "tabs",      plan: "business", default: true,  desc: "Per-project risk narrative from LLM." },
  gantt:            { id: "gantt",            label: "Gantt chart tab",                   group: "tabs",      plan: "pro",      default: true,  desc: "Timeline visualisation of milestones + tasks." },

  // ── Workflow / cross-cutting ──────────────────────────────────────────
  eSignature:       { id: "eSignature",       label: "Electronic signature on approvals", group: "workflow",  plan: "pro",      default: true,  desc: "Typed-name consent on change orders + RA bills." },
  drawingMarkup:    { id: "drawingMarkup",    label: "Drawing markup viewer",             group: "workflow",  plan: "pro",      default: true,  desc: "Canvas overlay on image attachments." },
  dprAuto:          { id: "dprAuto",          label: "Auto-DPR WhatsApp share (6 PM)",    group: "workflow",  plan: "business", default: false, desc: "Scheduled Daily Site Report via WhatsApp." },
  whatsappShare:    { id: "whatsappShare",    label: "WhatsApp share buttons",            group: "workflow",  plan: "basic",    default: true,  desc: "wa.me deep-link shares for invoices + DPR." },
  photoGeo:         { id: "photoGeo",         label: "Photo geolocation capture",         group: "workflow",  plan: "basic",    default: false, desc: "Capture lat/lng + timestamp on site photos (opt-in)." },
  quickCapture:     { id: "quickCapture",     label: "Quick-capture drawer",              group: "workflow",  plan: "basic",    default: true,  desc: "Bottom-sheet quick-add for update/issue/material." },
  offlineQueue:     { id: "offlineQueue",     label: "Offline queue",                     group: "workflow",  plan: "basic",    default: true,  desc: "Queue writes when offline, drain on reconnect." },

  // ── Org Admin panels (the new tier — each panel itself toggleable) ────
  orgAdminTemplates:        { id: "orgAdminTemplates",        label: "Templates panel",          group: "orgadmin", plan: "pro", default: true,  desc: "Reusable project / BOQ / checklist templates." },
  orgAdminApprovalChains:   { id: "orgAdminApprovalChains",   label: "Approval chains panel",    group: "orgadmin", plan: "pro", default: true,  desc: "Configurable ₹-threshold approval workflows." },
  orgAdminNotificationRules:{ id: "orgAdminNotificationRules",label: "Notification rules panel", group: "orgadmin", plan: "pro", default: true,  desc: "Trigger → channel → recipient automation." },
};

/** Initial seed shape — empty means "use defaults everywhere". */
export const INIT_ORG_FEATURE_FLAGS = {};      // { [org_id]: { [featureId]: bool } }
export const INIT_PLATFORM_FEATURE_FLAGS = {}; // { [featureId]: bool }  — superadmin kill-switches

/**
 * Resolve a single feature for a given org + plan.
 *
 *   platformFlags  ↦ { [featureId]: bool } — superadmin overrides
 *   orgFlags       ↦ { [org_id]: { [featureId]: bool } } — org overrides
 *   orgId          ↦ string
 *   featureId      ↦ catalog key
 *   plan           ↦ "basic"|"pro"|"business"|"custom"
 *
 * Returns boolean. Unknown feature ids default to TRUE so callers without
 * catalog entries (e.g. legacy code) keep working.
 */
export function isFeatureEnabled(platformFlags, orgFlags, orgId, featureId, plan) {
  const feature = FEATURE_CATALOG[featureId];
  if (!feature) return true; // unknown features default on
  if (feature.essential) return true; // hard-coded always on
  // Layer 1: super admin platform kill-switch
  if (platformFlags && platformFlags[featureId] === false) return false;
  // Layer 2: plan gate
  if (!ALL_PLANS.includes(plan)) plan = "basic";
  if (PLAN_ORDER[plan] < PLAN_ORDER[feature.plan]) return false;
  // Layer 3: org override or default
  const orgOverride = orgFlags?.[orgId]?.[featureId];
  if (typeof orgOverride === "boolean") return orgOverride;
  return feature.default;
}

/**
 * Toggle a feature for a specific org. Returns NEW orgFlags object (immutable).
 *
 * If a super admin has disabled the feature platform-wide, the org-level
 * toggle still gets recorded — but resolveFlag will continue to return false
 * until the platform unblocks it.
 */
export function setOrgFeature(orgFlags, orgId, featureId, value) {
  if (!orgId || !FEATURE_CATALOG[featureId]) return orgFlags || {};
  const next = { ...(orgFlags || {}) };
  next[orgId] = { ...(next[orgId] || {}), [featureId]: !!value };
  return next;
}

/** Toggle a feature platform-wide (superadmin only). */
export function setPlatformFeature(platformFlags, featureId, value) {
  if (!FEATURE_CATALOG[featureId]) return platformFlags || {};
  const next = { ...(platformFlags || {}) };
  next[featureId] = !!value;
  return next;
}

/** Bulk reset an org's flags back to catalog defaults. */
export function resetOrgFeatures(orgFlags, orgId) {
  if (!orgId) return orgFlags || {};
  const next = { ...(orgFlags || {}) };
  delete next[orgId];
  return next;
}

/** Count enabled features for an org (used for the "x/y enabled" hint). */
export function featureStats(platformFlags, orgFlags, orgId, plan) {
  let enabled = 0;
  let total = 0;
  let planLocked = 0;
  for (const id of Object.keys(FEATURE_CATALOG)) {
    if (FEATURE_CATALOG[id].essential) continue;
    total += 1;
    const planOk = PLAN_ORDER[plan || "basic"] >= PLAN_ORDER[FEATURE_CATALOG[id].plan];
    if (!planOk) {
      planLocked += 1;
      continue;
    }
    if (isFeatureEnabled(platformFlags, orgFlags, orgId, id, plan)) enabled += 1;
  }
  return { enabled, total, planLocked, planEligible: total - planLocked };
}

/** Group catalog entries by their `group` for rendering. */
export function catalogByGroup() {
  const out = Object.fromEntries(FEATURE_GROUPS.map(g => [g, []]));
  for (const id of Object.keys(FEATURE_CATALOG)) {
    const f = FEATURE_CATALOG[id];
    if (out[f.group]) out[f.group].push(f);
  }
  return out;
}

/** Returns the catalog entries a given role typically interacts with — used to
 *  show a personalised "X/Y features enabled" hint on the LoginScreen. */
export function featuresForRole(role) {
  // PM + contractor + client + architect mostly care about nav + tabs.
  // Org admin also cares about orgadmin group; superadmin cares about everything.
  if (role === "superadmin") return Object.keys(FEATURE_CATALOG);
  if (role === "orgadmin") return Object.keys(FEATURE_CATALOG);
  // For project-team roles, drop kiosks (mostly site-foot UI) + AR (architect-only).
  // Keep everything else they can actually touch.
  const exclude = new Set(["kioskLabour", "kioskSite", "arOverlay"]);
  if (role === "client") {
    // Clients only see read-only surfaces. Trim hard.
    return ["calendar", "messages", "drawingMarkup", "boq", "estimate", "changeorders"];
  }
  if (role === "contractor") {
    return ["rfi", "rabills", "ledger", "materials", "drawingMarkup", "messages", "quickCapture"];
  }
  return Object.keys(FEATURE_CATALOG).filter(id => !exclude.has(id));
}
