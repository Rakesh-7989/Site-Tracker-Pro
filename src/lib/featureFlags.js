// SiteTrack Pro — Sprint 1 (Session 30.2): Feature Freeze guard.
//
// Companion module to `orgFeatureFlags.js` — that one handles
// PLAN/ORG/PLATFORM cascading for features the product actually ships.
// THIS one handles the harder reality: features that LOOK shipped in the
// UI but are stubs server-side (RERA filing EFs returning fake acks,
// GSTN e-invoice in mock mode, LLM Insights needing customer-supplied
// keys, Polygon anchor stuck at 'pending' with no signer, etc.).
//
// The Sprint 1 freeze hides every stub view from non-staff users so:
//   1. Pilot demos never expose a fake ACK from a "production" feature.
//   2. The product surface non-staff users see is honest about what
//      actually works end-to-end.
//   3. Staff (founder, ops, superadmin) can still QA the stubs behind
//      the curtain.
//
// To FLIP a stub from staff-only → public, you must do BOTH:
//   • Remove the id from STUB_VIEWS below.
//   • Drop the matching row from `staff_only_features` via the next
//     SQL migration (DB-side parity is the audit trail).
//
// This is intentional friction. See docs/FEATURE_FREEZE.md.

/**
 * The frozen view list. Every entry corresponds to a value passed to
 * setView() in App.jsx and to a Sidebar.allItems[].id. Curated from the
 * Sprint 1 repo audit (3-lens technical / business / product) — every
 * id here has a documented stub or persistence-hole upstream.
 *
 * Source of audit: docs/SITETRACK_V3_PLAN.md §1 (mistakes) + workflow
 * task wz3yologq + w957hlybp output files.
 */
export const STUB_VIEWS = new Set([
  // RERA filing surfaces — tg-rera-submit / ka-rera-submit / mh-rera-submit
  // EFs return SCAFFOLD or fake "KA-{ts}" acks. Real filing not shipped.
  "compliance",

  // LLM Cost Forecast — needs customer's own Anthropic/OpenAI key. Demo-only
  // for orgs without keys; will silently fail or charge the wrong account.
  "forecast",

  // Material Prices — 6 ADAPTERS ARE MOCKS. Not connected to live commodity
  // APIs. Numbers shown are demo data; would mislead in production.
  "material-prices",

  // AR Drawing Overlay — explicitly beta + needs camera permissions tested
  // on a real Android. Not a credible pilot demo.
  "ar-overlay",

  // Labour / Site / AR kiosks — need Mantra MFS100 biometric driver, tablet
  // provisioning, geofence config. Sprint 3 deliverable.
  "kiosk-labour",
  "kiosk-site",

  // Persistence broken (TRUTH BOMB #2 in audit): these views have Supabase
  // tables but TABLE_BY_KEY map in lib/supabase.js doesn't include them, so
  // they silently localStorage-only. Multi-tenant claim doesn't hold.
  "delegations",
  "snapshot",
  "admin-audit-log",
  "admin-branding",
  "org-templates",
  "org-approvals",
  "org-notifications",
  "org-integrations",
  "org-features",       // exposes the broken-cascade UI
  "org-onboarding",     // depends on org-flag persistence

  // AI Insights tab (per-project) — same LLM-key issue as forecast. Not
  // a view at the App.jsx switch level but a tab inside detail; gated
  // separately via isStubTab() below.
]);

/**
 * Per-tab gating for the project DetailView. Same idea as STUB_VIEWS but
 * scoped to detail tabs. Currently only the AI tab needs gating.
 */
export const STUB_TABS = new Set([
  "ai",   // LLM key requirement; not safe to show to a pilot prospect.
]);

/**
 * The ONE workflow the founder is selling in Sprint 1: a WhatsApp
 * Daily Progress Report from the site supervisor to the promoter.
 * This view doesn't exist yet (Sprint 2 ships the real one) — until
 * then, the placeholder explains the value proposition + collects
 * a pilot interest signal.
 */
export const PRIMARY_WORKFLOW = "dpr";

/**
 * Is the given view in the staff-only freeze list?
 */
export function isStubView(viewId) {
  return STUB_VIEWS.has(viewId);
}

/**
 * Is the given DetailView tab in the staff-only freeze list?
 */
export function isStubTab(tabId) {
  return STUB_TABS.has(tabId);
}

/**
 * Is this user authorised to see staff-only stubs?
 *
 * Three ways in:
 *   1. `user.is_staff === true` flag (set by ops via migration 49).
 *   2. role === 'superadmin' (always).
 *   3. email in VITE_STAFF_EMAILS allowlist (for local dev + founder).
 */
export function isStaffUser(user) {
  if (!user || typeof user !== "object") return false;
  if (user.is_staff === true) return true;
  if (user.role === "superadmin") return true;
  try {
    const env = (typeof import.meta !== "undefined" ? import.meta.env : {}) || {};
    const allow = env.VITE_STAFF_EMAILS || "";
    if (!allow) return false;
    const list = String(allow).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const email = String(user.email || "").trim().toLowerCase();
    return email && list.includes(email);
  } catch {
    return false;
  }
}

/**
 * The single check site for both view + user, used by App.jsx
 * effectiveView calculation and Sidebar nav filter.
 *
 *   true  = block this view for this user (it's a stub and they're not staff)
 *   false = let them through
 */
export function isViewStubBlocked(user, viewId) {
  return isStubView(viewId) && !isStaffUser(user);
}

export function isTabStubBlocked(user, tabId) {
  return isStubTab(tabId) && !isStaffUser(user);
}
