// SiteTrack Pro - superadmin/staff review of a signup request.
//
// APPROVE: create the org on the requested plan, invite or link the applicant,
// add them as org admin, then mark the request approved.
// REJECT: mark rejected with optional notes.
//
// Auth: platform staff (superadmin, or staff owner/head/member repair path).

// @ts-ignore - Deno URL import; resolved at runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { canApproveSignupRequest } from "../_shared/signupApproval.ts";

// @ts-ignore - Deno global.
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

const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };

// P-E: approved applicants sign in with a generated temp password (emailed),
// then MUST change it on first login (profiles.must_change_password = true).
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

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "org";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function isAlreadyRegistered(message: string | undefined): boolean {
  const m = (message || "").toLowerCase();
  return m.includes("already") || m.includes("exist") || m.includes("registered");
}

async function createOrganization(admin, firm: string, plan: string, staffId: string) {
  const withAttribution = await admin
    .from("organizations")
    .insert({ slug: slugify(firm), name: firm, plan, created_by_staff: staffId })
    .select("id")
    .single();

  if (!withAttribution.error || !String(withAttribution.error.message || "").includes("created_by_staff")) {
    return withAttribution;
  }

  return await admin
    .from("organizations")
    .insert({ slug: slugify(firm), name: firm, plan })
    .select("id")
    .single();
}

async function ensureApplicantProfile(admin, userId: string, contact: string, email: string, consentVersion?: string | null, mustChangePassword = false) {
  const name = contact.trim() || email.split("@")[0] || "SiteTrack user";
  const profile: Record<string, unknown> = { id: userId, name, role: "client" };
  if (consentVersion) {
    profile.consent_version = consentVersion;
    profile.consent_updated_at = new Date().toISOString();
  }
  if (mustChangePassword) profile.must_change_password = true;
  return await admin
    .from("profiles")
    .upsert(profile, { onConflict: "id", ignoreDuplicates: true });
}

async function sendTempPasswordEmail(
  to: string,
  firm: string,
  plan: string,
  tempPassword: string,
  loginUrl: string,
): Promise<boolean> {
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpPort = Deno.env.get("SMTP_PORT");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");

  if (smtpHost && smtpPort && smtpUser && smtpPassword) {
    // Send via SMTP
    try {
      const from = `"SiteTrack Pro" <${smtpUser}>`;
      const socket = await Deno.net.connect({
        hostname: smtpHost,
        port: parseInt(smtpPort),
      });

      // Start TLS
      await new Promise<void>((resolve, reject) => {
        socket.secureAsyncResolve = resolve;
        socket.secureAsyncReject = reject;
        socket.startTLS({ hostname: smtpHost });
      });

      // Authenticate
      const write = (data: string) => new Promise<void>((resolve, reject) => {
        socket.write(new TextEncoder().encode(data + "\r\n"));
        setTimeout(resolve, 1000);
      });

      const readLine = (): Promise<string> => new Promise((resolve) => {
        let data = "";
        socket.ondata = (event: any) => {
          data += new TextDecoder().decode(event.data);
          if (data.includes("\n")) {
            const line = data.substring(0, data.indexOf("\n"));
            socket.ondata = undefined;
            resolve(line);
          }
        };
      });

      await readLine(); // 220
      await write(`EHLO ${smtpHost}`);
      await readLine(); // 250
      await write(`AUTH LOGIN`);
      await readLine(); // 334
      await write(Buffer.from(smtpUser).toString("base64"));
      await readLine(); // 334
      await write(Buffer.from(smtpPassword).toString("base64"));
      await readLine(); // 235

      // Mail from
      await write(`MAIL FROM:<${smtpUser}>`);
      await readLine(); // 250

      // RCPT TO
      await write(`RCPT TO:<${to}>`);
      await readLine(); // 250

      // DATA
      await write(`DATA`);
      await readLine(); // 354

      const emailHtml = `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
  <div style="text-align:center;margin-bottom:24px">
    <div style="width:48px;height:48px;border-radius:12px;background:#ea580c;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700">S</div>
  </div>
  <h2 style="color:#1c1917;text-align:center">Your SiteTrack Pro workspace is ready</h2>
  <p style="color:#57534e">Hi ${firm} team,</p>
  <p style="color:#57534e">Your workspace on the <b>${PLAN_LABEL[plan] || plan}</b> plan is approved and ready.
     Sign in with the temporary password below.</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fafaf9;border-radius:8px;font-size:14px">
    <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Organization</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${firm}</td></tr>
    <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Email</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${to}</td></tr>
    <tr><td style="padding:10px 16px;color:#78716c">Temporary password</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;font-family:monospace;letter-spacing:1px">${tempPassword}</td></tr>
  </table>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#991b1b">
    <strong>Important:</strong> You must change this password after your first sign-in.
  </div>
  <p style="text-align:center;margin:28px 0">
    <a href="${loginUrl}" style="background:#ea580c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
      Sign in to SiteTrack Pro
    </a>
  </p>
  <p style="color:#78716c;font-size:13px;text-align:center">- Team SiteTrack Pro</p>
</div>`;

      await write(`${emailHtml}\r\n.\r\n`);
      await readLine(); // 250
      await write(`QUIT`);
      await readLine(); // 221

      socket.close();
      return true;
    } catch (e) {
      console.error("SMTP send failed, falling back to REST API", e);
      // Fall through to REST API below
    }
  }

  // Fall back to REST API
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: `Your SiteTrack Pro workspace is ready — ${firm}`, html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
}

// E2: seed billing_history for gateway-paid signups at org creation (org_id
// exists only now). Non-fatal — telemetry failure must not block provisioning.
async function seedBillingHistory(admin, orgId: string, reqRow: Record<string, unknown>): Promise<boolean> {
  const paid = String(reqRow.payment_status ?? "unpaid") === "paid";
  const amountPaise = Number(reqRow.paid_amount_paise);
  if (!paid || !Number.isFinite(amountPaise) || amountPaise <= 0) return false;

  const { error } = await admin.from("billing_history").insert({
    org_id: orgId,
    provider: "cashfree",
    external_id: reqRow.payment_ref == null ? null : String(reqRow.payment_ref),
    amount: Math.round(amountPaise),
    status: "succeeded",
    paid_at: reqRow.paid_at == null ? null : String(reqRow.paid_at),
    payload: { source: "signup_gateway", signup_request_id: String(reqRow.id) },
  });
  if (error) {
    console.warn("seedBillingHistory: billing_history insert failed (non-fatal):", error.message);
    return false;
  }
  return true;
}

async function sendBrandedInvite(
  to: string,
  firm: string,
  plan: string,
  link: string,
  existingUser = false,
): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;

  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const instruction = existingUser
    ? "Click below to sign in with your existing account."
    : "Click below to set your password and sign in.";
  const actionText = existingUser ? "Open workspace" : "Set password &amp; enter workspace";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2 style="color:#ea580c">Welcome to SiteTrack Pro</h2>
      <p>Hi ${esc(firm)} team,</p>
      <p>Your workspace on the <b>${esc(PLAN_LABEL[plan] || plan)}</b> plan is approved and ready.
         ${instruction}</p>
      <p style="margin:28px 0">
        <a href="${link}" style="background:#ea580c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">
          ${actionText}
        </a>
      </p>
      <p style="color:#78716c;font-size:13px">If the button does not work, copy this link:<br>${esc(link)}</p>
      <p style="color:#78716c;font-size:13px">- Team SiteTrack Pro</p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: "Your SiteTrack Pro workspace is ready", html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  const auth = await authenticate(req, { requireRole: ["superadmin"] });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }

  const requestId = String(body.requestId ?? "");
  const action = String(body.action ?? "");
  const notes = body.notes ? String(body.notes).slice(0, 1000) : null;
  if (!requestId || !["approve", "reject"].includes(action)) {
    return json({ ok: false, error: "bad-input" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: reqRow, error: rErr } = await admin
    .from("signup_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (rErr) return json({ ok: false, error: "lookup-failed", detail: rErr.message }, 500);
  if (!reqRow) return json({ ok: false, error: "not-found" }, 404);
  if (reqRow.status !== "pending") {
    return json({ ok: false, error: "already-reviewed", message: `Request is already ${reqRow.status}.` }, 409);
  }

  if (action === "reject") {
    const { error } = await admin
      .from("signup_requests")
      .update({ status: "rejected", review_notes: notes, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) return json({ ok: false, error: "update-failed", detail: error.message }, 500);
    return json({ ok: true, action: "rejected" }, 200);
  }

  const paidBy = reqRow.paid_by == null ? null : String(reqRow.paid_by);
  let ownerConfirmedPaymentByIds = new Set<string>();
  if (String(reqRow.payment_status ?? "unpaid") === "paid" && paidBy) {
    const { data: paidByProfile, error: paidByErr } = await admin
      .from("profiles")
      .select("staff_tier")
      .eq("id", paidBy)
      .maybeSingle();
    if (paidByErr) return json({ ok: false, error: "payment-review-lookup-failed", detail: paidByErr.message }, 500);
    if (paidByProfile?.staff_tier === "owner") ownerConfirmedPaymentByIds = new Set([paidBy]);
  }

  const approvalGate = canApproveSignupRequest(auth.user, reqRow, ownerConfirmedPaymentByIds);
  if (!approvalGate.ok) {
    return json({
      ok: false,
      error: "owner-payment-required",
      message: "Only the owner can approve without payment. Other staff can approve only after the owner confirms payment as received.",
    }, 403);
  }

  const firm = String(reqRow.firm_name);
  const email = String(reqRow.email).toLowerCase();
  const plan = String(reqRow.plan);
  const contact = String(reqRow.contact_name);
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrack-rakesh.vercel.app").replace(/\/+$/, "");
  const redirectTo = `${siteUrl}/login`;

  const { data: org, error: orgErr } = await createOrganization(admin, firm, plan, auth.user.id);
  if (orgErr) return json({ ok: false, error: "org-create-failed", detail: orgErr.message }, 500);

  const orgId = String(org.id);
  const rollbackOrg = async () => {
    await admin.from("organizations").delete().eq("id", orgId);
  };

  let userId: string | null = null;
  let emailSent = false;
  let existingUser = false;
  let tempPasswordIssued = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (resendKey) {
    // P-E: for a brand-new applicant, create the auth user via the admin API
    // with a generated temp password (email it), and force a password change on
    // first login. Existing accounts keep the magic-link path.
    const tempPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: contact },
    });

    if (!createErr && created?.user?.id) {
      userId = created.user.id;
      tempPasswordIssued = true;
      emailSent = await sendTempPasswordEmail(email, firm, plan, tempPassword, redirectTo);
    } else {
      if (!isAlreadyRegistered(createErr?.message)) {
        await rollbackOrg();
        return json({ ok: false, error: "create-user-failed", detail: createErr?.message }, 502);
      }

      const { data: loginData, error: loginErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (loginErr || !loginData?.user) {
        await rollbackOrg();
        return json({
          ok: false,
          error: "existing-user-link-failed",
          message: "This email already has an account, but we could not create a login link.",
          detail: loginErr?.message,
        }, 502);
      }

      userId = loginData.user.id;
      existingUser = true;
      emailSent = await sendBrandedInvite(email, firm, plan, String(loginData.properties?.action_link ?? redirectTo), true);
    }
  } else {
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name: contact },
      redirectTo,
    });

    if (inviteErr || !inviteData?.user) {
      if (!isAlreadyRegistered(inviteErr?.message)) {
        await rollbackOrg();
        return json({ ok: false, error: "invite-failed", detail: inviteErr?.message }, 502);
      }

      const { data: loginData, error: loginErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (loginErr || !loginData?.user) {
        await rollbackOrg();
        return json({
          ok: false,
          error: "existing-user-link-failed",
          message: "This email already has an account, but we could not find the auth user.",
          detail: loginErr?.message,
        }, 502);
      }

      userId = loginData.user.id;
      existingUser = true;
      emailSent = false;
    } else {
      userId = inviteData.user.id;
      emailSent = true;
    }
  }

  if (!userId) {
    await rollbackOrg();
    return json({ ok: false, error: "auth-user-missing" }, 502);
  }

  const { error: profileErr } = await ensureApplicantProfile(admin, userId, contact, email, reqRow.consent_version, tempPasswordIssued);
  if (profileErr) {
    await rollbackOrg();
    return json({ ok: false, error: "profile-repair-failed", detail: profileErr.message }, 500);
  }

  const { error: omErr } = await admin
    .from("org_members")
    .upsert({ org_id: orgId, profile_id: userId, role: "admin", removed_at: null }, { onConflict: "org_id,profile_id" });
  if (omErr) {
    await rollbackOrg();
    return json({ ok: false, error: "org-member-failed", detail: omErr.message }, 500);
  }

  // E2: gateway-paid signups get their charge into billing_history now that the
  // org exists (orgs view MRR + platform billing). Non-fatal on failure.
  const billingSeeded = await seedBillingHistory(admin, orgId, reqRow);

  const { error: updErr } = await admin
    .from("signup_requests")
    .update({ status: "approved", review_notes: notes, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), created_org_id: orgId })
    .eq("id", requestId);
  if (updErr) {
    await rollbackOrg();
    return json({ ok: false, error: "finalize-failed", detail: updErr.message }, 500);
  }

  return json({ ok: true, action: "approved", orgId, userId, emailSent, existingUser, tempPasswordIssued, billingSeeded }, 200);
});
