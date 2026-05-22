// SiteTrack Pro — Supabase client + persistence adapter
//
// Activation: set the env vars below and run `npm install @supabase/supabase-js`
//   VITE_BACKEND=supabase
//   VITE_SUPABASE_URL=https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon key>
//
// Without those vars the app continues to work fully in localStorage demo mode.
// This module deliberately uses dynamic import so the Supabase SDK is NOT
// bundled into the demo build (saves ~150 KB gzipped).

const ENV = typeof import.meta !== "undefined" ? import.meta.env : {};
export const BACKEND_MODE = ENV.VITE_BACKEND || "local";

let _clientPromise = null;

export function isSupabaseEnabled() {
  return BACKEND_MODE === "supabase" && !!ENV.VITE_SUPABASE_URL && !!ENV.VITE_SUPABASE_ANON_KEY;
}

export function getSupabaseClient() {
  if (!isSupabaseEnabled()) return Promise.resolve(null);
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    try {
      // Dynamic import so the SDK only ships when actually enabled.
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    } catch (err) {
      console.error("Supabase SDK load failed — falling back to local mode", err);
      return null;
    }
  })();
  return _clientPromise;
}

// ── Auth helpers ────────────────────────────────────────────────────────────
export async function signInWithMagicLink(email) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut() {
  const sb = await getSupabaseClient();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getCurrentUser() {
  const sb = await getSupabaseClient();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  // Pull profile row to enrich with role/name/avatar
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  return { ...user, ...(profile || {}) };
}

// ── Persistence adapter — paired with useLS in App.jsx ──────────────────────
//
// Strategy: SiteTrack stores most state per "key" (projects, milestones, etc.).
// In backend mode, each key becomes a remote table. The adapter exposes:
//   load(key, defaultValue)  → reads from Supabase, falls back to default
//   save(key, value)         → writes to Supabase, debounced
// For now the demo continues to use localStorage. To wire up Supabase:
//   1. Run scripts/supabase/01_schema.sql + 02_rls.sql on the project.
//   2. Replace the `useLS` hook in App.jsx with a hook that calls these.
//
// This stub keeps the interface stable so the swap can be incremental.

const TABLE_BY_KEY = {
  projects: "projects",
  milestones: "milestones",
  updates: "site_updates",
  expenses: "expenses",
  teams: "team_members",
  attendance: "attendance",
  issues: "issues",
  materials: "materials",
  drawings: "drawings",
  tasks: "tasks",
  rfi: "rfis",
  co: "change_orders",
  inspections: "inspections",
  safety: "safety_incidents",
  vendors: "vendors",
  pos: "purchase_orders",
  invoices: "invoices",
  labour: "labour_register",
  ra: "ra_bills",
  boq: "boq_items",
  ledger: "inventory_transactions",
  estimate: "estimates",
  messages: "messages",
  notifs: "notifications",
  activity: "activity_log",
};

export async function loadKey(key, defaultValue) {
  const sb = await getSupabaseClient();
  if (!sb) return defaultValue;
  const table = TABLE_BY_KEY[key];
  if (!table) return defaultValue;
  const { data, error } = await sb.from(table).select("*");
  if (error) { console.warn(`Supabase load(${table}) failed:`, error.message); return defaultValue; }
  // Frontend currently uses { [projectId]: [...] } shape for most keys.
  // Group rows by project_id for compatibility.
  if (Array.isArray(data) && data.length && data[0].project_id) {
    return data.reduce((acc, row) => {
      (acc[row.project_id] = acc[row.project_id] || []).push(row);
      return acc;
    }, {});
  }
  return data;
}

export async function saveKey(/* key, value */) {
  // TODO: This is a stub. Real implementation needs row-level diff vs cached
  // state + .upsert with conflict on id. See docs/BACKEND_PLAN.md Phase B3.
  // Returning a no-op promise lets the existing useLS hook continue to write
  // to localStorage as a cache layer until this is implemented.
  return Promise.resolve();
}

// Helper for the auth UI — replaces the demo role picker once enabled.
export function isAuthAvailable() { return isSupabaseEnabled(); }
