export const FEATURE_GROUPS = ["nav", "tabs", "workflow", "orgadmin"];

const ALL_PLANS = ["basic", "pro", "business", "custom"];
const PLAN_ORDER: Record<string, number> = { basic: 0, pro: 1, business: 2, custom: 3 };

interface FeatureEntry {
  id: string;
  label: string;
  group: string;
  plan: string;
  default: boolean;
  desc: string;
  essential?: boolean;
}

export const FEATURE_CATALOG: Record<string, FeatureEntry> = {
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
  eSignature:       { id: "eSignature",       label: "Electronic signature on approvals", group: "workflow",  plan: "pro",      default: true,  desc: "Typed-name consent on change orders + RA bills." },
  drawingMarkup:    { id: "drawingMarkup",    label: "Drawing markup viewer",             group: "workflow",  plan: "pro",      default: true,  desc: "Canvas overlay on image attachments." },
  dprAuto:          { id: "dprAuto",          label: "Auto-DPR WhatsApp share (6 PM)",    group: "workflow",  plan: "business", default: false, desc: "Scheduled Daily Site Report via WhatsApp." },
  whatsappShare:    { id: "whatsappShare",    label: "WhatsApp share buttons",            group: "workflow",  plan: "basic",    default: true,  desc: "wa.me deep-link shares for invoices + DPR." },
  photoGeo:         { id: "photoGeo",         label: "Photo geolocation capture",         group: "workflow",  plan: "basic",    default: false, desc: "Capture lat/lng + timestamp on site photos (opt-in)." },
  quickCapture:     { id: "quickCapture",     label: "Quick-capture drawer",              group: "workflow",  plan: "basic",    default: true,  desc: "Bottom-sheet quick-add for update/issue/material." },
  offlineQueue:     { id: "offlineQueue",     label: "Offline queue",                     group: "workflow",  plan: "basic",    default: true,  desc: "Queue writes when offline, drain on reconnect." },
  orgAdminTemplates:        { id: "orgAdminTemplates",        label: "Templates panel",          group: "orgadmin", plan: "pro", default: true,  desc: "Reusable project / BOQ / checklist templates." },
  orgAdminApprovalChains:   { id: "orgAdminApprovalChains",   label: "Approval chains panel",    group: "orgadmin", plan: "pro", default: true,  desc: "Configurable ₹-threshold approval workflows." },
  orgAdminNotificationRules:{ id: "orgAdminNotificationRules",label: "Notification rules panel", group: "orgadmin", plan: "pro", default: true,  desc: "Trigger → channel → recipient automation." },
};

export const INIT_ORG_FEATURE_FLAGS: Record<string, Record<string, boolean>> = {};
export const INIT_PLATFORM_FEATURE_FLAGS: Record<string, boolean> = {};

export function isFeatureEnabled(platformFlags: Record<string, boolean>, orgFlags: Record<string, Record<string, boolean>>, orgId: string, featureId: string, plan: string): boolean {
  const feature = FEATURE_CATALOG[featureId];
  if (!feature) return true;
  if (feature.essential) return true;
  if (platformFlags && platformFlags[featureId] === false) return false;
  if (!ALL_PLANS.includes(plan)) plan = "basic";
  if (PLAN_ORDER[plan] < PLAN_ORDER[feature.plan]) return false;
  const orgOverride = orgFlags?.[orgId]?.[featureId];
  if (typeof orgOverride === "boolean") return orgOverride;
  return feature.default;
}

export function setOrgFeature(orgFlags: Record<string, Record<string, boolean>>, orgId: string, featureId: string, value: boolean): Record<string, Record<string, boolean>> {
  if (!orgId || !FEATURE_CATALOG[featureId]) return orgFlags || {};
  const next = { ...(orgFlags || {}) };
  next[orgId] = { ...(next[orgId] || {}), [featureId]: !!value };
  return next;
}

export function setPlatformFeature(platformFlags: Record<string, boolean>, featureId: string, value: boolean): Record<string, boolean> {
  if (!FEATURE_CATALOG[featureId]) return platformFlags || {};
  const next = { ...(platformFlags || {}) };
  next[featureId] = !!value;
  return next;
}

export function resetOrgFeatures(orgFlags: Record<string, Record<string, boolean>>, orgId: string): Record<string, Record<string, boolean>> {
  if (!orgId) return orgFlags || {};
  const next = { ...(orgFlags || {}) };
  delete next[orgId];
  return next;
}

export function featureStats(platformFlags: Record<string, boolean>, orgFlags: Record<string, Record<string, boolean>>, orgId: string, plan: string): { enabled: number; total: number; planLocked: number; planEligible: number } {
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

export function catalogByGroup(): Record<string, FeatureEntry[]> {
  const out: Record<string, FeatureEntry[]> = Object.fromEntries(FEATURE_GROUPS.map(g => [g, []]));
  for (const id of Object.keys(FEATURE_CATALOG)) {
    const f = FEATURE_CATALOG[id];
    if (out[f.group]) out[f.group].push(f);
  }
  return out;
}

export function featuresForRole(role: string): string[] {
  if (role === "superadmin") return Object.keys(FEATURE_CATALOG);
  if (role === "orgadmin") return Object.keys(FEATURE_CATALOG);
  const exclude = new Set(["kioskLabour", "kioskSite", "arOverlay"]);
  if (role === "client") {
    return ["calendar", "messages", "drawingMarkup", "boq", "estimate", "changeorders"];
  }
  if (role === "contractor") {
    return ["rfi", "rabills", "ledger", "materials", "drawingMarkup", "messages", "quickCapture"];
  }
  return Object.keys(FEATURE_CATALOG).filter(id => !exclude.has(id));
}
