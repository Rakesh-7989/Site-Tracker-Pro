// SiteTrack Pro — self-service org registration.
//
// Firm owner fills a form → this EF creates the auth user, creates the org,
// assigns them as orgadmin, and sends a welcome email. No superadmin approval
// needed. Paid-plan registrations go through Cashfree checkout first.
//
// Deploy: `node scripts/deploy-edge-functions.mjs` (needs `supabase login`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

const ALLOWED = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "https://sitetrack.in,http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED[0] ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const VALID_PLANS = ["basic", "pro", "business"] as const;
const VALID_SEGMENTS = ["construction", "architecture", "interior", "consultancy", "multiple"] as const;
const VALID_BILLING = ["monthly", "annual"] as const;
// Self-service orgs start on the Pro plan with a 14-day free trial (Zoho-style
// trial-first). The owner picks/keeps a paid plan in onboarding before the
// trial ends (see docs/ZOHO_SIGNUP_REDESIGN_PHASE_C_PLAN.md).
const TRIAL_DAYS = 14;
const TRIAL_PLAN = "pro";

const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "org";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  let pw = "";
  pw += upper[crypto.getRandomValues(new Uint8Array(1))[0] % upper.length];
  pw += lower[crypto.getRandomValues(new Uint8Array(1))[0] % lower.length];
  pw += digits[crypto.getRandomValues(new Uint8Array(1))[0] % digits.length];
  for (let i = 0; i < 9; i++) {
    pw += all[crypto.getRandomValues(new Uint8Array(1))[0] % all.length];
  }
  return pw.split("").sort(() => crypto.getRandomValues(new Uint8Array(1))[0] - 128).join("");
}

// Reworked for the email-confirm + Pro-trial flow: the account is NOT yet
// confirmed (email_confirm:false), so this email must NOT contain the password
// or a "sign in now" CTA. Supabase sends its own confirmation link; this is a
// branded heads-up about the Pro trial. Deliberately does not duplicate the
// confirm link (single source of truth = Supabase's confirm email).
async function sendWelcomeEmail(to: string, firmName: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:48px;height:48px;border-radius:12px;background:#ea580c;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700">S</div>
      </div>
      <h2 style="color:#1c1917;text-align:center">Welcome to SiteTrack Pro</h2>
      <p style="color:#57534e">Hi there,</p>
      <p style="color:#57534e">Your workspace <b>${esc(firmName)}</b> is being set up. To activate it, please confirm your email address using the confirmation link we sent separately — once confirmed, you can sign in and finish setting up your workspace.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#166534">
        <strong>Your ${TRIAL_DAYS}-day Pro free trial:</strong> your workspace starts on the <b>Pro plan</b> — all Pro features unlocked — free for ${TRIAL_DAYS} days. Pick a plan to keep after the trial ends.
      </div>
      <p style="color:#78716c;font-size:13px;text-align:center">- Team SiteTrack Pro</p>
    </div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: `Activate your ${firmName} workspace on SiteTrack Pro`, html }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const firmName = String(body.firmName ?? "").trim();
  const contactName = String(body.contactName ?? "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  // Plan defaults to Pro (the 14-day trial plan). Explicit plan/billing/segment
  // are still accepted for deep-link (`?plan=`) callers, but omitted by the
  // new minimal identity screen — the EF then provisions a Pro trial.
  const plan = String(body.plan ?? TRIAL_PLAN);
  // Honeypot: a hidden field real users never fill (bots do). Pretend success,
  // create nothing. Same posture as submit_signup_request.
  const honeypot = String(body.website ?? "").trim();
  if (honeypot) return json({ ok: true }, 200);
  const consentVersion = body.consentVersion ? String(body.consentVersion).trim() : null;
  // Billing cycle (P-D unified signup): "monthly" | "annual". Optional for
  // back-compat with older clients; defaults to monthly. Annual = "2 months
  // free" (annual ≈ monthly × 10, per plans.ts).
  const billing = String(body.billing ?? "monthly");
  // Company segment (v4 C0, migration 134). Optional for back-compat with
  // older clients; when present it MUST be a known segment. Legacy rows keep
  // segment = null until the owner picks one in onboarding.
  const segment = body.segment ? String(body.segment).trim() : null;

  if (!email || !email.includes("@")) return json({ ok: false, error: "invalid-email" }, 400);
  if (password.length < 8) return json({ ok: false, error: "password-too-short" }, 400);
  if (!firmName) return json({ ok: false, error: "firm-name-required" }, 400);
  if (!VALID_PLANS.includes(plan as typeof VALID_PLANS[number])) return json({ ok: false, error: "invalid-plan" }, 400);
  if (!VALID_BILLING.includes(billing as typeof VALID_BILLING[number])) return json({ ok: false, error: "invalid-billing" }, 400);
  if (segment && !VALID_SEGMENTS.includes(segment as typeof VALID_SEGMENTS[number])) {
    return json({ ok: false, error: "invalid-segment" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Source IP for rate-limiting (first hop in x-forwarded-for).
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  // Throttle: max 5 self-service org creations per IP per hour (mirrors the
  // submit_signup_request posture that the honest review praised — the legacy
  // approval path had this, the live self-service path did not).
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gt("created_at", since);
    if ((count ?? 0) >= 5) {
      return json({ ok: false, error: "rate-limited", message: "Too many workspace signups from your network. Please try again in about an hour." }, 429);
    }
  }

  // 1. Create auth user — email NOT auto-confirmed. Supabase sends its own
  //    confirmation email; the workspace activates only after the owner clicks
  //    the link (Zoho-style verify step, closes the self-service abuse gap).
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { name: contactName || email.split("@")[0] },
  });

  if (createErr) {
    const msg = (createErr.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json({ ok: false, error: "email-taken", message: "This email already has an account. Please sign in instead." }, 409);
    }
    return json({ ok: false, error: "create-failed", message: createErr.message }, 502);
  }

  const userId = createData?.user?.id;
  if (!userId) return json({ ok: false, error: "user-id-missing" }, 502);

  // 2. Create org — plan = Pro (trial). billing/segment optional (segment only
  //    when present; back-compat with legacy orgs that leave it null).
  const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: orgData, error: orgErr } = await admin
    .from("organizations")
    .insert({ slug: slugify(firmName), name: firmName, plan: TRIAL_PLAN, billing_period: billing, ...(segment ? { segment } : {}) })
    .select("id")
    .single();

  if (orgErr || !orgData) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return json({ ok: false, error: "org-create-failed", detail: orgErr?.message }, 500);
  }

  const orgId = String(orgData.id);

  // 2b. Record the Pro trial subscription (status='trial', trial_ends_at=+14d).
  //     Best-effort — a failure here must never undo org creation. The gating
  //     source stays organizations.plan (='pro' during the trial); this row is
  //     the audit/expiry record used by the trial-end read-side check + cron.
  await admin.from("subscriptions").upsert({
    org_id: orgId,
    provider: "manual",
    plan: TRIAL_PLAN,
    status: "trial",
    trial_ends_at: trialEnd,
    current_period_end: trialEnd,
  }, { onConflict: "org_id" }).catch(() => {});

  // 3. Create profile with orgadmin role
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({
      id: userId,
      name: contactName || email.split("@")[0] || "Org Owner",
      role: "orgadmin",
      phone,
      consent_version: consentVersion,
      consent_updated_at: consentVersion ? new Date().toISOString() : null,
    }, { onConflict: "id", ignoreDuplicates: false });

  if (profileErr) {
    await admin.from("organizations").delete().eq("id", orgId).catch(() => {});
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return json({ ok: false, error: "profile-create-failed", detail: profileErr.message }, 500);
  }

  // 4. Add as org member with admin tier
  const { error: omErr } = await admin
    .from("org_members")
    .upsert({ org_id: orgId, profile_id: userId, role: "admin", removed_at: null }, { onConflict: "org_id,profile_id" });

  if (omErr) {
    await admin.from("organizations").delete().eq("id", orgId).catch(() => {});
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return json({ ok: false, error: "org-member-failed", detail: omErr.message }, 500);
  }

  // 5. Send branded heads-up email (confirm link comes from Supabase itself)
  const emailSent = await sendWelcomeEmail(email, firmName);

  // 6. Record the successful attempt for the IP rate limit (best-effort —
  //    a failure here must never undo the org creation).
  if (ip) {
    await admin.from("signup_attempts").insert({ ip }).catch(() => {});
  }

  return json({
    ok: true,
    orgId,
    userId,
    emailSent,
    plan: TRIAL_PLAN,
    trialEndsAt: trialEnd,
    message: "Organization created. Please confirm your email to activate your workspace.",
  }, 200);
});
