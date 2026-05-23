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
