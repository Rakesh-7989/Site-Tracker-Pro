// SiteTrack Pro — redeem a single-use STAFF invite (platform staff hierarchy).
//
// Public (the invitee has no account yet) — the invite TOKEN is the credential.
// Flow:
//   1. atomically CLAIM the token (used_at set under WHERE used_at IS NULL …) so
//      two people can never redeem the same invite (block-by-default: one token
//      = exactly one staff signup, then it's spent)
//   2. create the auth user via the admin API (bypasses disable_signup)
//   3. promote the new profile → role='superadmin', is_staff, staff_tier from the
//      invite, staff_manager_id = the inviter
//   4. record used_by on the invite
// If user creation fails after the claim, the token is released so it can be
// reused. Zero new spend (auth email goes via the configured Gmail SMTP).
//
// Deploy: npx supabase functions deploy redeem-staff-invite --project-ref nntkxojdeyziemdhyjvg

// @ts-ignore — Deno URL import; resolved at runtime, not by Node tsc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-ignore — Deno global.
declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

const ALLOWED = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "https://sitetrackpro.in,https://www.sitetrackpro.in,http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);
// Echo the allow-listed request Origin (static ACAO breaks non-first origins).
let REQ: Request | null = null;
const CORS = (): Record<string, string> => {
  const origin = REQ?.headers.get("origin") ?? "";
  const match = ALLOWED.find(a => a === origin) ?? ALLOWED[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};
const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS(), "Content-Type": "application/json" } });

Deno.serve(async (req: Request): Promise<Response> => {
  REQ = req;
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }

  const token = String(body.token ?? "").trim();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  const providedEmail = String(body.email ?? "").trim().toLowerCase();

  if (!token) return json({ ok: false, error: "missing-token" }, 400);
  if (password.length < 8) return json({ ok: false, error: "weak-password", message: "Password must be at least 8 characters." }, 400);
  if (!name) return json({ ok: false, error: "missing-name", message: "Please enter your name." }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── 1. Atomically claim the token (single-use guarantee) ──
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("staff_invites")
    .update({ used_at: nowIso })
    .eq("token", token)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .select("id, email, tier, created_by")
    .maybeSingle();

  if (claimErr) return json({ ok: false, error: "db-error", detail: claimErr.message }, 500);
  if (!claimed) return json({ ok: false, error: "invalid-or-used", message: "This invite link is invalid, already used, revoked, or expired." }, 410);

  const releaseToken = async () => {
    await admin.from("staff_invites").update({ used_at: null }).eq("id", claimed.id);
  };

  // The invite may lock the email; otherwise the invitee supplies it.
  const email = (claimed.email ? String(claimed.email) : providedEmail).trim().toLowerCase();
  if (!email || !email.includes("@")) {
    await releaseToken();
    return json({ ok: false, error: "missing-email", message: "Please enter your email." }, 400);
  }
  const tier = claimed.tier === "head" ? "head" : "member";

  // ── 2. Create the auth user (pre-confirmed; bypasses disable_signup) ──
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (cErr || !created?.user) {
    const msg = (cErr?.message || "").toLowerCase();
    await releaseToken();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json({ ok: false, error: "already-exists", message: "This email already has an account — sign in instead." }, 409);
    }
    return json({ ok: false, error: "create-failed", message: "Could not create your account. Try again.", detail: cErr?.message }, 502);
  }
  const newUserId = created.user.id;

  // ── 3. Promote the profile to staff (trigger made a role='client' row) ──
  const { error: pErr } = await admin
    .from("profiles")
    .update({ role: "superadmin", is_staff: true, staff_tier: tier, staff_manager_id: claimed.created_by, name })
    .eq("id", newUserId);
  if (pErr) {
    // Account exists but not elevated — surface a clear error; the owner can fix.
    return json({ ok: false, error: "promote-failed", message: "Account made but staff role not set — contact the owner.", detail: pErr.message }, 500);
  }

  // ── 4. Record who consumed the invite ──
  await admin.from("staff_invites").update({ used_by: newUserId }).eq("id", claimed.id);

  return json({ ok: true, email, tier }, 200);
});
