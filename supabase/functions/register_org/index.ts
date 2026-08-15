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
const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business" };
const BILLING_LABEL: Record<string, string> = { monthly: "Monthly", annual: "Annual" };
const ROLE_LABEL: Record<string, string> = {
  orgadmin: "Firm Owner",
};

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

async function sendWelcomeEmail(to: string, firmName: string, tempPassword: string, loginUrl: string, plan: string, billing: string): Promise<boolean> {
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
      <p style="color:#57534e">Your workspace <b>${esc(firmName)}</b> is ready. You are registered as the <b>Firm Owner</b>.</p>
      <p style="color:#57534e">Use the credentials below to sign in:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fafaf9;border-radius:8px;font-size:14px">
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Organization</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(firmName)}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Role</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">Firm Owner (orgadmin)</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Plan</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(PLAN_LABEL[plan] ?? plan)}${billing === "annual" ? " (annual — 2 months free)" : ""}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Billing</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(BILLING_LABEL[billing] ?? billing)}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Email</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(to)}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c">Temporary password</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;font-family:monospace;letter-spacing:1px">${esc(tempPassword)}</td></tr>
      </table>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#991b1b">
        <strong>Important:</strong> Please change your password after first login.
      </div>
      <p style="text-align:center;margin:28px 0">
        <a href="${esc(loginUrl)}" style="background:#ea580c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
          Sign in to SiteTrack Pro
        </a>
      </p>
      <p style="color:#78716c;font-size:13px;text-align:center">- Team SiteTrack Pro</p>
    </div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: `Welcome to SiteTrack Pro — ${firmName} is ready`, html }),
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
  const plan = String(body.plan ?? "basic");
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
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrack-rakesh.vercel.app").replace(/\/+$/, "");
  const loginUrl = `${siteUrl}/login`;

  // 1. Create auth user
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
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

  // 2. Create org
  const { data: orgData, error: orgErr } = await admin
    .from("organizations")
    .insert({ slug: slugify(firmName), name: firmName, plan, billing_period: billing, ...(segment ? { segment } : {}) })
    .select("id")
    .single();

  if (orgErr || !orgData) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return json({ ok: false, error: "org-create-failed", detail: orgErr?.message }, 500);
  }

  const orgId = String(orgData.id);

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

  // 5. Send welcome email
  const emailSent = await sendWelcomeEmail(email, firmName, password, loginUrl, plan, billing);

  return json({
    ok: true,
    orgId,
    userId,
    emailSent,
    message: "Organization created successfully. Welcome to SiteTrack Pro!",
  }, 200);
});
