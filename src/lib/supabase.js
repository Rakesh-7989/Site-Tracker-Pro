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

/**
 * Returns the canonical app URL the Supabase Auth emails should redirect to.
 *
 * Priority:
 *   1. VITE_APP_URL env var, if set AND not the stale `app.sitetrack.in`
 *      placeholder. We deliberately reject the placeholder because pasting
 *      a non-existent domain into Supabase Redirect URLs would silently
 *      send users to a NXDOMAIN page.
 *   2. window.location.origin (works in dev: localhost:5173, AND in prod
 *      when the user hits the live site directly).
 *   3. Hardcoded prod fallback (sitetrack-rakesh.vercel.app) — ONLY used
 *      for SSR / tests; the browser path always uses #2.
 *
 * Caveat: Supabase Auth has its OWN URL allow-list ("Site URL" +
 * "Redirect URLs" in the Dashboard). If our returned URL isn't in that
 * allow-list, Supabase IGNORES the value we send and falls back to
 * Site URL — which is why a stale `localhost:5173` Site URL routes
 * production password resets to localhost. That side needs a dashboard
 * fix per docs/SIGNUP_TROUBLESHOOTING.md.
 */
export function getCanonicalAppUrl() {
  const envUrl = ENV.VITE_APP_URL;
  if (envUrl && typeof envUrl === "string" && !/app\.sitetrack\.in/.test(envUrl)) {
    return envUrl.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "https://sitetrack-rakesh.vercel.app";
}

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
    options: { emailRedirectTo: getCanonicalAppUrl() },
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

/**
 * Session 29 — Self-serve sign-up (Point 2 from spec).
 *
 * Creates an auth.users row with metadata; the `trg_handle_signup` trigger
 * in 34_signup_self_serve.sql then auto-creates:
 *   - public.organizations row (firm)
 *   - public.profiles row (set role='orgadmin')
 *   - public.org_members row (linking user → org as admin)
 *
 * After this, Supabase sends a verification email; the user must click the
 * link (or paste the OTP code) before they can sign in.
 *
 * @param {Object} args
 * @param {string} args.email      — work email
 * @param {string} args.password   — chosen password (>= 6 chars per Supabase default)
 * @param {string} args.firmName   — firm / org name (becomes organizations.name)
 * @param {string} args.userName   — full name of the signing-up person
 * @param {string} args.plan       — 'basic' | 'pro' | 'business' (NOT 'custom')
 */
export async function signUp({ email, password, firmName, userName, plan = "basic" }) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  if (plan === "custom") return { ok: false, error: "Custom plan requires sales contact." };
  const { data, error } = await sb.auth.signUp({
    email: String(email || "").trim(),
    password: String(password || ""),
    options: {
      data: {
        firm_name: String(firmName || "").trim(),
        name: String(userName || "").trim(),
        plan,
      },
      emailRedirectTo: getCanonicalAppUrl(),
    },
  });
  // Supabase wraps multiple distinct failure modes under HTTP 500 + the
  // generic "Database error saving new user" mask. The two we hit most
  // often in production:
  //   - Email send rate limit (Supabase shared SMTP throttled to ~3/hr).
  //     Fix: wire Resend SMTP (docs/RESEND_SMTP_SETUP.md).
  //   - handle_new_signup trigger raised — usually a missing GRANT or
  //     stale enum value.
  // We surface a more actionable message so the UX doesn't dead-end on
  // a generic "Database error".
  if (error) {
    const msg = String(error.message || "");
    if (/database error saving new user/i.test(msg)) {
      return {
        ok: false,
        error: "signup-rate-limited",
        detail: "Sign-up is temporarily blocked. This usually means the Supabase shared SMTP rate limit is hit — wire Resend SMTP via docs/RESEND_SMTP_SETUP.md, or try again in ~30 minutes.",
      };
    }
    return { ok: false, error: error.message };
  }
  // Supabase enumeration-protection: when the email is ALREADY registered,
  // signUp returns 200 OK with a user object that has NO identities, NO
  // session, and the original created_at. This is intentional (prevents
  // enumeration attacks) but it dead-ends our UX because the FE would
  // optimistically show "verification email sent" when no email was sent.
  //
  // Detect the pattern and route the user to the sign-in flow.
  const identities = data?.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return {
      ok: false,
      error: "email-already-registered",
      detail: `An account already exists for ${email}. Please sign in instead — or use "Forgot password" if you don't remember it.`,
    };
  }
  return {
    ok: true,
    user: data?.user || null,
    needsConfirmation: !data?.session,   // true if email verification required
  };
}

/**
 * Session 29 — Password sign-in (Point 5 from spec).
 * Alternative to magic-link for users who prefer typed credentials.
 */
export async function signInWithPassword(email, password) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { data, error } = await sb.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || ""),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data?.user || null };
}

/**
 * Session 29 — Request a password-reset email.
 */
export async function resetPassword(email) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { error } = await sb.auth.resetPasswordForEmail(
    String(email || "").trim(),
    { redirectTo: `${getCanonicalAppUrl()}/auth/reset` },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Session 29 — Accept an org invitation (called when ?invite=<token> is in URL).
 * Calls accept_org_invitation() RPC defined in 37_org_invitations.sql.
 */
export async function acceptOrgInvitation(token) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { data, error } = await sb.rpc("accept_org_invitation", { p_token: token });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { ok: false, error: row?.reason || "unknown" };
  return { ok: true, orgId: row.org_id, role: row.role };
}

/**
 * Session 29 — Create an org invitation (called from Org Admin → Members).
 * Calls create_org_invitation() RPC. Returns the generated token so the UI
 * can build a "?invite=<token>" share link if needed.
 */
export async function createOrgInvitation(email, role) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { data, error } = await sb.rpc("create_org_invitation", {
    p_email: String(email || "").trim(),
    p_role: String(role || "client"),
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { ok: false, error: row?.reason || "unknown" };
  return { ok: true, invitationId: row.invitation_id, token: row.token };
}

/**
 * Session 29 — Fetch the public plan list (filters out super-admin-only tiers).
 * Reads the public_plans() RPC defined in 36_custom_plan_lock.sql.
 */
export async function fetchPublicPlans() {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled", plans: [] };
  const { data, error } = await sb.from("plans").select("*")
    .eq("status", "active").eq("requires_superadmin", false)
    .order("display_order", { ascending: true });
  if (error) return { ok: false, error: error.message, plans: [] };
  return { ok: true, plans: data || [] };
}

/**
 * Session 29 — Read the org's current quota snapshot.
 * Returns: [{resource:'projects', current_count, max_allowed, at_quota}, ...]
 */
export async function fetchOrgQuotaSnapshot(orgId) {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled", quotas: [] };
  const { data, error } = await sb.rpc("org_quota_snapshot", { p_org_id: orgId });
  if (error) return { ok: false, error: error.message, quotas: [] };
  return { ok: true, quotas: data || [] };
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
