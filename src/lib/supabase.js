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

/**
 * Session 28.2: verify a 6-digit OTP code from a magic-link email.
 *
 * Why this exists: Gmail's link-scanner prefetches every URL in every
 * incoming email to check for malware. That GET request consumes the
 * one-time token before the user can click it, leaving them with an
 * "otp_expired" error. The 6-digit code printed at the bottom of the
 * same email is plain text — Gmail can't auto-use it. So we offer it
 * as a fallback path for Gmail/Outlook/Yahoo users.
 */
export async function verifyEmailOtp(email, token) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { error } = await sb.auth.verifyOtp({
    email: String(email || "").trim(),
    token: String(token || "").trim(),
    type: "email",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getCurrentUser() {
  const sb = await getSupabaseClient();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  // Pull profile row to enrich with role/name/avatar.
  // A fresh magic-link user has no profiles row yet — use sensible defaults
  // so the UI doesn't crash on ROLE_META[user.role].bg etc.
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const enriched = { ...user, ...(profile || {}) };
  // Session 28.2: every user must have at least these fields populated. The
  // ROLE_META map keys off `role` — fallback to 'client' (the safest, most
  // restrictive role) when no profile row exists yet.
  if (!enriched.role) enriched.role = "client";
  if (!enriched.name) enriched.name = enriched.email?.split("@")[0] || "New user";
  return enriched;
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

// saveKey: pushes the entire keyed value to its mapped table.
//
// SiteTrack's frontend state is shaped as { [projectId]: [rows...] } for most
// keys. We flatten to rows + upsert by id. This works because the schema in
// 01_schema.sql has matching column names. Rows are scoped by RLS so a
// caller without permission silently writes nothing — caller should use
// loadKey() to verify the round-trip.
//
// For "flat" keys (vendors, profiles, orgs) the value is already a row list.
export async function saveKey(key, value) {
  const sb = await getSupabaseClient();
  if (!sb) return;
  const table = TABLE_BY_KEY[key];
  if (!table) return;

  // Flatten { pid: [rows] } shape into a single rows array with project_id.
  const rows = [];
  if (Array.isArray(value)) {
    rows.push(...value);
  } else if (value && typeof value === "object") {
    for (const [pid, list] of Object.entries(value)) {
      if (Array.isArray(list)) list.forEach(row => rows.push({ ...row, project_id: pid }));
    }
  }

  if (rows.length === 0) return;
  // Upsert in batches of 100 to stay under Postgres argument limits.
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await sb.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      console.warn(`saveKey(${table}) batch failed:`, error.message);
      throw error;
    }
  }
}

// Subscribe to realtime changes on a table. Returns an unsubscribe function.
//
//   const off = subscribeTable("activity_log", row => addActivityToFeed(row));
//   off();   // call when component unmounts
//
// In production this is gated by RLS — clients only get rows they can SELECT.
export async function subscribeTable(table, onInsert) {
  const sb = await getSupabaseClient();
  if (!sb) return () => {};
  const channel = sb
    .channel(`rt:${table}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table }, payload => {
      onInsert(payload.new);
    })
    .subscribe();
  return () => sb.removeChannel(channel);
}

// Migration: copy entire localStorage sitetrack_v2 blob into Supabase.
// Idempotent — uses upsert. Returns { keys: number, rows: number } summary.
export async function migrateLocalToBackend() {
  const sb = await getSupabaseClient();
  if (!sb) throw new Error("Supabase is not enabled.");
  // Session 21 fix: guard against corrupted localStorage. Previously a single
  // malformed character would throw + abort the entire migration before any
  // upsert. With this fallback the worst case is "nothing to migrate" instead
  // of a hard failure.
  let all = {};
  try { all = JSON.parse(localStorage.getItem("sitetrack_v2") || "{}"); }
  catch (err) { console.warn("localStorage corrupt — nothing to migrate:", err.message); return { keys: 0, rows: 0 }; }
  let totalKeys = 0, totalRows = 0;
  for (const [key, value] of Object.entries(all)) {
    if (!TABLE_BY_KEY[key]) continue;
    try {
      await saveKey(key, value);
      totalKeys++;
      if (Array.isArray(value)) totalRows += value.length;
      else if (value && typeof value === "object") totalRows += Object.values(value).flat().length;
    } catch (err) {
      console.warn(`Migration ${key} failed:`, err.message);
    }
  }
  return { keys: totalKeys, rows: totalRows };
}

// Helper for the auth UI — replaces the demo role picker once enabled.
export function isAuthAvailable() { return isSupabaseEnabled(); }

// ── Live connection probe (Session 17) ──────────────────────────────────────
//
// Quick "is the backend actually reachable" check. Used by the topbar pill
// so an operator can verify the connection without devtools.
//
// Returns one of:
//   "off"       — VITE_BACKEND != "supabase" (localStorage mode)
//   "live"      — Reachable + auth.getSession succeeded
//   "degraded"  — Reachable but queries fail (likely missing schema or RLS)
//   "offline"   — Network error (no internet, project paused, wrong URL)
//
// Does NOT throw; safe to call from a useEffect.
export async function probeConnection() {
  if (!isSupabaseEnabled()) return { state: "off", detail: "VITE_BACKEND=local" };
  try {
    const sb = await getSupabaseClient();
    if (!sb) return { state: "offline", detail: "client init failed" };
    // 1. Cheap: ask the SDK if it has a session cached.
    const { error: authErr } = await sb.auth.getSession();
    if (authErr) return { state: "degraded", detail: `auth: ${authErr.message}` };
    // 2. Round-trip: probe a small table that RLS will return empty for anon.
    const { error: tableErr } = await sb.from("projects").select("id").limit(1);
    if (tableErr) {
      // 42P01 = undefined_table; means schema not applied.
      const msg = (tableErr.code || "") + " " + tableErr.message;
      return { state: "degraded", detail: msg };
    }
    return { state: "live", detail: "" };
  } catch (err) {
    return { state: "offline", detail: err.message || String(err) };
  }
}
