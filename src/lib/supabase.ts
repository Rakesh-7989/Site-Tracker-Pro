import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "./supabasePublicConfig";

const ENV: Record<string, string | undefined> = typeof import.meta !== "undefined" ? import.meta.env : {};

function isValidUrl(val: string | undefined): boolean {
  if (!val || typeof val !== "string") return false;
  if (val.includes("YOUR_") || val.includes("example.com")) return false;
  return val.startsWith("http://") || val.startsWith("https://");
}

function isValidJwt(val: string | undefined): boolean {
  if (!val || typeof val !== "string") return false;
  if (val.includes("YOUR_")) return false;
  return val.startsWith("eyJ");
}

const SUPABASE_URL: string = isValidUrl(ENV.VITE_SUPABASE_URL) ? (ENV.VITE_SUPABASE_URL as string) : PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY: string = isValidJwt(ENV.VITE_SUPABASE_ANON_KEY) ? (ENV.VITE_SUPABASE_ANON_KEY as string) : PUBLIC_SUPABASE_ANON_KEY;
export const CANONICAL_APP_URL = "https://sitetrackpro.in";

const BLOCKED_APP_HOSTS = new Set([
  "app.sitetrack.in",
  "app.sitetrackpro.in",
]);

function isLocalAppHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function trustedAppOrigin(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const url = new URL(rawUrl.trim().replace(/\/+$/, ""));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalAppHost(hostname))) return null;
    if (BLOCKED_APP_HOSTS.has(hostname)) return null;
    if (hostname.endsWith(".vercel.app") && url.origin !== CANONICAL_APP_URL) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const BACKEND_MODE: string = ENV.VITE_BACKEND || (SUPABASE_URL && SUPABASE_ANON_KEY ? "supabase" : "local");

let _clientPromise: Promise<SupabaseClient | null> | null = null;

export function getCanonicalAppUrl(): string {
  const envUrl = trustedAppOrigin(ENV.VITE_APP_URL);
  if (envUrl) return envUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    const windowUrl = trustedAppOrigin(window.location.origin);
    if (windowUrl) return windowUrl;
  }
  return CANONICAL_APP_URL;
}

export function isSupabaseEnabled(): boolean {
  return BACKEND_MODE === "supabase" && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

export async function getClient(): Promise<SupabaseClient | null> {
  return getSupabaseClient();
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseEnabled()) return null;
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    try {
      const { createClient } = await import("@supabase/supabase-js");

      // In dev, preview, or sandboxed environments where Supabase blocks CORS or third-party origins,
      // route requests through the same-origin Vite proxy (/api/supabase) for seamless connectivity.
      const resolvedUrl = (typeof window !== "undefined" && window.location?.origin && !window.location.origin.includes("sitetrackpro.in"))
        ? `${window.location.origin}/api/supabase`
        : SUPABASE_URL;

      const client = createClient(resolvedUrl, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
        global: {
          headers: {
            apikey: SUPABASE_ANON_KEY,
          },
        },
      });
      return client;
    } catch (err) {
      console.error("Supabase SDK load failed — falling back to local mode", err);
      return null;
    }
  })();
  return _clientPromise;
}

interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthResultWithUser extends AuthResult {
  user?: unknown;
}

interface SignUpResult extends AuthResult {
  detail?: string;
  user?: unknown;
  needsConfirmation?: boolean;
}

interface VerifyOtpResult extends AuthResult {}

interface RedeemStaffInviteResult extends AuthResult {
  email?: string;
  tier?: string;
}

interface AcceptOrgInvitationResult extends AuthResult {
  orgId?: string;
  role?: string;
}

interface CreateOrgInvitationResult extends AuthResult {
  invitationId?: string;
  token?: string;
}

interface FetchPublicPlansResult extends AuthResult {
  plans: unknown[];
}

interface FetchOrgQuotaResult extends AuthResult {
  quotas: unknown[];
}

export async function signInWithMagicLink(email: string): Promise<AuthResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { error } = await (sb as any).auth.signInWithOtp({
    email,
    options: { emailRedirectTo: getCanonicalAppUrl(), shouldCreateUser: false },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = await getSupabaseClient();
  if (!sb) return;
  await (sb as any).auth.signOut();
}

export async function verifyEmailOtp(email: string, token: string): Promise<VerifyOtpResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { error } = await (sb as any).auth.verifyOtp({
    email: String(email || "").trim(),
    token: String(token || "").trim(),
    type: "email",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

interface SignUpArgs {
  email: string;
  password: string;
  firmName: string;
  userName: string;
  plan?: string;
}

export async function signUp({ email, password, firmName, userName, plan = "basic" }: SignUpArgs): Promise<SignUpResult> {
  const selfServeSignupAllowed = ENV.VITE_ALLOW_SELF_SERVE_SIGNUP === "true";
  if (!selfServeSignupAllowed) {
    return {
      ok: false,
      error: "signups not allowed",
      detail: "New workspaces require request access and owner/payment approval.",
    };
  }
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  if (plan === "custom") return { ok: false, error: "Custom plan requires sales contact." };
  const { data, error } = await (sb as any).auth.signUp({
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
    needsConfirmation: !data?.session,
  };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResultWithUser> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { data, error } = await (sb as any).auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || ""),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data?.user || null };
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { error } = await (sb as any).auth.resetPasswordForEmail(
    String(email || "").trim(),
    { redirectTo: `${getCanonicalAppUrl()}/auth/reset` },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { error } = await (sb as any).auth.updateUser({ password: String(newPassword || "") });
  return error ? { ok: false, error: error.message } : { ok: true };
}

interface RedeemStaffInviteArgs {
  token: string;
  name: string;
  email: string;
  password: string;
}

export async function redeemStaffInvite({ token, name, email, password }: RedeemStaffInviteArgs): Promise<RedeemStaffInviteResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, error: "backend-disabled" };
  const functionsBase = (typeof window !== "undefined" && window.location?.origin && !window.location.origin.includes("sitetrackpro.in"))
    ? `${window.location.origin}/api/ef`
    : `${SUPABASE_URL}/functions/v1`;
  let res: Response;
  try {
    res = await fetch(`${functionsBase}/redeem-staff-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ token, name, email, password }),
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || "network-error" };
  }
  const j = await res.json().catch(() => ({}));
  return j.ok
    ? { ok: true, email: j.email, tier: j.tier }
    : { ok: false, error: j.message || j.error || `HTTP ${res.status}` };
}

export async function acceptOrgInvitation(token: string): Promise<AcceptOrgInvitationResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { data, error } = await (sb as any).rpc("accept_org_invitation", { p_token: token });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { ok: false, error: row?.reason || "unknown" };
  return { ok: true, orgId: row.org_id, role: row.role };
}

export async function createOrgInvitation(email: string, role: string): Promise<CreateOrgInvitationResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled" };
  const { data, error } = await (sb as any).rpc("create_org_invitation", {
    p_email: String(email || "").trim(),
    p_role: String(role || "client"),
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { ok: false, error: row?.reason || "unknown" };
  return { ok: true, invitationId: row.invitation_id, token: row.token };
}

export async function fetchPublicPlans(): Promise<FetchPublicPlansResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled", plans: [] };
  const { data, error } = await (sb as any).from("plans").select("*")
    .eq("status", "active").eq("requires_superadmin", false)
    .order("display_order", { ascending: true });
  if (error) return { ok: false, error: error.message, plans: [] };
  return { ok: true, plans: data || [] };
}

export async function fetchOrgQuotaSnapshot(orgId: string): Promise<FetchOrgQuotaResult> {
  const sb = await getSupabaseClient();
  if (!sb) return { ok: false, error: "backend-disabled", quotas: [] };
  const { data, error } = await (sb as any).rpc("org_quota_snapshot", { p_org_id: orgId });
  if (error) return { ok: false, error: error.message, quotas: [] };
  return { ok: true, quotas: data || [] };
}

export async function getCurrentUser(): Promise<Record<string, any> | null> {
  const sb = await getSupabaseClient();
  if (!sb) return null;
  const { data: { user } } = await (sb as any).auth.getUser();
  if (!user) return null;
  const { data: profile } = await (sb as any).from("profiles").select("*").eq("id", user.id).maybeSingle();
  const enriched: Record<string, any> = { ...user, ...(profile || {}) };
  if (!enriched.role) enriched.role = "client";
  if (!enriched.name) enriched.name = enriched.email?.split("@")[0] || "New user";
  return enriched;
}

const TABLE_BY_KEY: Record<string, string> = {
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

export async function loadKey(key: string, defaultValue: unknown): Promise<unknown> {
  const sb = await getSupabaseClient();
  if (!sb) return defaultValue;
  const table = TABLE_BY_KEY[key];
  if (!table) return defaultValue;
  const { data, error } = await (sb as any).from(table).select("*");
  if (error) { console.warn(`Supabase load(${table}) failed:`, error.message); return defaultValue; }
  if (Array.isArray(data) && data.length && data[0].project_id) {
    return data.reduce((acc: Record<string, any[]>, row: any) => {
      (acc[row.project_id] = acc[row.project_id] || []).push(row);
      return acc;
    }, {});
  }
  return data;
}

export async function saveKey(key: string, value: any): Promise<void> {
  const sb = await getSupabaseClient();
  if (!sb) return;
  const table = TABLE_BY_KEY[key];
  if (!table) return;
  const rows: any[] = [];
  if (Array.isArray(value)) {
    rows.push(...value);
  } else if (value && typeof value === "object") {
    for (const [pid, list] of Object.entries(value)) {
      if (Array.isArray(list)) list.forEach(row => rows.push({ ...row, project_id: pid }));
    }
  }
  if (rows.length === 0) return;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await (sb as any).from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      console.warn(`saveKey(${table}) batch failed:`, error.message);
      throw error;
    }
  }
}

interface MigrationResult {
  keys: number;
  rows: number;
}

export async function migrateLocalToBackend(): Promise<MigrationResult> {
  const sb = await getSupabaseClient();
  if (!sb) throw new Error("Supabase is not enabled.");
  let all: Record<string, any> = {};
  try { all = JSON.parse(localStorage.getItem("sitetrack_v2") || "{}"); }
  catch (err: any) { console.warn("localStorage corrupt — nothing to migrate:", err.message); return { keys: 0, rows: 0 }; }
  let totalKeys = 0, totalRows = 0;
  for (const [key, value] of Object.entries(all)) {
    if (!TABLE_BY_KEY[key]) continue;
    try {
      await saveKey(key, value);
      totalKeys++;
      if (Array.isArray(value)) totalRows += value.length;
      else if (value && typeof value === "object") totalRows += (Object.values(value) as any[]).flat().length;
    } catch (err: any) {
      console.warn(`Migration ${key} failed:`, err.message);
    }
  }
  return { keys: totalKeys, rows: totalRows };
}

export function isAuthAvailable(): boolean { return isSupabaseEnabled(); }

interface ProbeResult {
  state: "off" | "live" | "degraded" | "offline";
  detail: string;
}

export async function probeConnection(): Promise<ProbeResult> {
  if (!isSupabaseEnabled()) return { state: "off", detail: "VITE_BACKEND=local" };
  try {
    const sb = await getSupabaseClient();
    if (!sb) return { state: "offline", detail: "client init failed" };
    const { error: authErr } = await (sb as any).auth.getSession();
    if (authErr) return { state: "degraded", detail: `auth: ${authErr.message}` };
    const { error: tableErr } = await (sb as any).from("projects").select("id").limit(1);
    if (tableErr) {
      const msg = (tableErr.code || "") + " " + tableErr.message;
      return { state: "degraded", detail: msg };
    }
    return { state: "live", detail: "" };
  } catch (err: any) {
    return { state: "offline", detail: err.message || String(err) };
  }
}
