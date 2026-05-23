// SiteTrack Pro — Demo mode helpers.
//
// Production-mode default: empty workspace. New customer signs up → sees
// "Create your first project" CTA, builds their own data.
//
// Sales-demo mode: one click loads the rich showcase dataset (5 orgs, 15
// users, 4 projects, BOQ, RA bills, etc.) from seed.demo.js so a prospect
// can see the entire product in 5 minutes.
//
// The data lives in localStorage under the SAME key (`sitetrack_v2`) that
// useLS uses. Loading demo data just overwrites the keys; clearing data
// wipes localStorage and IndexedDB.

import { DEMO_SEED } from "../data/seed.demo.js";

const LS_KEY = "sitetrack_v2";
const DEMO_FLAG_KEY = "sitetrack_demo_mode";

/**
 * True if the localStorage currently holds the demo dataset. Detected by
 * checking for the presence of the "Skyline Tower Phase II" demo project id.
 */
export function isDemoLoaded() {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return Array.isArray(all.projects) && all.projects.some(p => p.id === "p1");
  } catch { return false; }
}

/** Returns a summary of what's currently stored (for the login screen pill). */
export function dataSummary() {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const projects = (all.projects || []).length;
    const orgs = (all.orgs || []).length;
    const users = (all.admin_users || []).length;
    return { projects, orgs, users, isEmpty: projects === 0 && orgs === 0 && users === 0 };
  } catch { return { projects: 0, orgs: 0, users: 0, isEmpty: true }; }
}

/**
 * Overwrite localStorage with the rich demo dataset. Used by the
 * "Load demo data" button on the login screen.
 */
export function loadDemoData() {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    // Preserve any user-set preferences (dark mode, language) on top of the
    // demo data overwrite.
    const merged = { ...DEMO_SEED, dark: existing.dark, lang: existing.lang };
    localStorage.setItem(LS_KEY, JSON.stringify(merged));
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    return true;
  } catch (err) {
    console.error("loadDemoData failed:", err);
    return false;
  }
}

/**
 * Clear everything: localStorage business data + IndexedDB attachments.
 * Brings the app back to the empty production-grade state.
 */
export async function clearAllData() {
  try {
    // Preserve only dark/lang preferences
    let dark, lang;
    try {
      const existing = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      dark = existing.dark;
      lang = existing.lang;
    } catch {}
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(DEMO_FLAG_KEY);
    localStorage.removeItem("sitetrack_sync_queue_v1");
    // Restore preferences
    if (dark !== undefined || lang !== undefined) {
      localStorage.setItem(LS_KEY, JSON.stringify({ dark, lang }));
    }
    // Best-effort IndexedDB blob wipe (attachments)
    if (typeof indexedDB !== "undefined") {
      try { indexedDB.deleteDatabase("sitetrack_offline_v1"); } catch {}
    }
    return true;
  } catch (err) {
    console.error("clearAllData failed:", err);
    return false;
  }
}
