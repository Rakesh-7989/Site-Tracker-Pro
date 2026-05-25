// SiteTrack Pro — Default (empty) seed.
//
// A brand-new customer signs up to an EMPTY workspace and creates their first
// project. That's the production reality. This file therefore exports empty
// arrays/objects for every per-project key.
//
// The rich showcase dataset (5 orgs, 15 users, 4 projects, drawings, BOQ, RA
// bills, etc.) lives in `./seed.demo.js`. It is loaded on demand via the
// "Load demo data" button on the login screen — see `src/lib/demoMode.js`.
//
// We DO re-export two things from the demo file that are NOT data per se but
// are needed at startup:
//   - MOCK_USERS — identities for the demo role-picker login (so the picker
//     has something to log in AS; data behind these accounts is still empty
//     until the user creates it).
//   - PLAN_META  — pricing tier labels, used by Admin Console copy.
// These two stay constant in production; only the project/org/user record
// lists become empty by default.

export { MOCK_USERS, PLAN_META } from "./seed.demo.js";

// Empty per-project objects ({} since most are keyed by project id).
export const INIT_PROJECTS    = [];
export const INIT_MILESTONES  = {};
export const INIT_UPDATES     = {};
export const INIT_EXPENSES    = {};
export const INIT_TEAMS       = {};
export const INIT_ATTENDANCE  = {};
export const INIT_ISSUES      = {};
export const INIT_MATERIALS   = {};
export const INIT_DRAWINGS    = {};
export const INIT_ACTIVITY    = [];
export const INIT_NOTIFS      = [];
export const INIT_TASKS       = {};
export const INIT_PUNCH       = {};
export const INIT_RFI         = {};
export const INIT_CO          = {};
export const INIT_INSPECTIONS = {};
export const INIT_SAFETY      = {};
export const INIT_VENDORS     = [];
export const INIT_POS         = {};
export const INIT_INVOICES    = {};
export const INIT_LABOUR      = {};
export const INIT_RA          = {};
export const INIT_COMMENTS    = [];
export const INIT_BOQ         = {};
export const INIT_ESTIMATE    = {};
export const INIT_LEDGER      = {};
export const INIT_EQUIPMENT   = {};
export const INIT_DIARY       = {};
export const INIT_WORKLOGS    = {};
export const INIT_CHECKLISTS  = {};
export const INIT_SUBMITTALS  = {};
export const INIT_PERMITS     = {};
export const INIT_MESSAGES    = {};
export const INIT_ORGS        = [];
export const INIT_ADMIN_USERS = [];
export const INIT_SUPPORT     = [];

// ── Roadmap additions (hierarchical model + business platform) ───────────────
// Project → Block → Floor → Unit hierarchy for residential/commercial projects.
// All keyed by project id (except UNITS which is keyed by floor id for fast
// lookup on a single floor screen).
export const INIT_BLOCKS      = {};   // { [project_id]: Block[] }
export const INIT_FLOORS      = {};   // { [block_id]: Floor[] }
export const INIT_UNITS       = {};   // { [floor_id]: Unit[] }

// White-label branding cascade (Org → Project → default). Stored as a single
// object whose values are { logoUrl, tagline, accent, theme } shapes.
export const INIT_BRANDING    = { org: {}, project: {} };

// Immutable audit log (append-only). Each entry:
//   { id, ts, actor_id, actor_name, action, resource, resource_id, before, after, ip?, ua? }
export const INIT_AUDIT_LOG   = [];

// Approval delegations: { id, from_user_id, to_user_id, scope, start, end, reason, active }.
export const INIT_DELEGATIONS = [];

// Frozen daily KPI snapshots, keyed by project id then ISO date.
// snapshot row: { date, progress, workers, materials_consumed, billed, open_issues, weather }.
export const INIT_DAILY_SNAPSHOTS = {}; // { [project_id]: { [yyyy-mm-dd]: snapshot } }

// Material price aggregator cache, keyed by commodity → vendor quotes array.
export const INIT_MATERIAL_PRICES = {}; // { steel: [...], cement: [...], ... }

// Compliance check results per project: RERA/GST/EPFO/PAN verification cache.
// shape: { [project_id]: { rera: {...}, gst: {...}, epfo: {...}, pan: {...} } }
export const INIT_COMPLIANCE  = {};

// AI cost-forecaster cache (so the predictions persist across reloads).
// shape: { [project_id]: { generated_at, summary, overrun_amount, confidence } }
export const INIT_FORECAST    = {};

// ── Production Phase 1 — Org Admin tier ──────────────────────────────────────
// Configurable approval chains per org per resource type.
// shape: { [org_id]: { expense: chain, po: chain, ra_bill: chain, ... } }
export const INIT_APPROVAL_CHAINS = {};

// Org-level integration credentials (replaces per-user localStorage).
// shape: { [org_id]: { ai, razorpay, whatsapp, cashfree } }
export const INIT_ORG_INTEGRATIONS = {};

// Reusable templates per org per kind.
// shape: { [org_id]: { project: Template[], boq: Template[], checklist: Template[] } }
export const INIT_TEMPLATES = {};

// Notification rules per org.
// shape: { [org_id]: NotifRule[] }
// rule: { id, trigger, channel, recipients: user_id[], created, enabled }
export const INIT_NOTIFICATION_RULES = {};

// Admin feature toggles (Q6 demo / Q7 kiosk modes — set by superadmin / orgadmin).
// shape: object of bool flags; lives next to adminFlags in App.jsx.
export const INIT_OPS_TOGGLES = {
  demoLoaderEnabled: true,        // Q6 — show "Load demo data" button on login
  demoModePermanent: false,       // Q6 — true = data persists in localStorage; false = session-only
  kioskLabourEnabled: true,       // Q7 — Labour Attendance Kiosk in nav
  kioskSiteEnabled: true,         // Q7 — Site Wall Kiosk in nav
  kioskArEnabled: true,           // Q7 — AR Drawing Overlay in nav
  tenantOnboardingMode: "guided", // Q8 — guided | minimal | enterprise (configurable)
};
