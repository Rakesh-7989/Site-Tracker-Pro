// SiteTrack Pro — invite a BRAND-NEW user to an org by email (HRMS Phase B).
//
// Org admin enters an email that has no SiteTrack account yet. This function:
//   1. verifies the caller is an admin of the target org (or superadmin)
//   2. creates the auth user (with temp password if sendCredentials=true)
//   3. ensures a profile row exists
//   4. adds the new user to the org at the chosen tier (org_members)
//   5. sends a branded email with credentials + role info (if sendCredentials=true)
//
// Existing accounts are handled by the in-app "Find" flow (lookup_user_for_
// invite RPC) — this EF is only for new emails.
//
// Deploy: `node scripts/deploy-edge-functions.mjs` (needs `supabase login`).

// @ts-ignore — Deno URL import; resolved at runtime, not by Node tsc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — Deno URL import.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { authenticate } from "../_shared/auth.ts";

// @ts-ignore — Deno global.
declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

const ALLOWED = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "https://sitetrackpro.in,http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED[0] ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const VALID_IDENTITY_ROLES = [
  "superadmin", "orgadmin", "promoter", "project_admin", "prospector", "pm",
  "architect", "senior_architect", "junior_architect", "design_architect_interior",
  "design_head", "consultant_head", "mep_consultant", "structural_consultant",
  "consultant", "designer", "site_engineer", "site_inspector",
  "contractor", "sub_contractor", "vendor", "client",
];

const ORG_TIER_ROLES = ["admin", "pm", "architect", "contractor", "client", "vendor"];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", pm: "Project Manager", architect: "Architect",
  contractor: "Contractor", client: "Client", vendor: "Vendor",
};

const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

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

async function sendRoleWelcomeEmail(
  to: string,
  orgName: string,
  role: string,
  tempPassword: string,
  loginUrl: string,
): Promise<boolean> {
  const smtpUser = Deno.env.get("GMAIL_SMTP_USER");
  const smtpPass = Deno.env.get("GMAIL_SMTP_PASS");
  if (!smtpUser || !smtpPass) {
    console.error("invite_org_member: GMAIL_SMTP_USER / GMAIL_SMTP_PASS not set — cannot send email");
    return false;
  }

  const roleLabel = ROLE_LABEL[role] || role;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:48px;height:48px;border-radius:12px;background:#ea580c;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700">S</div>
      </div>
      <h2 style="color:#1c1917;text-align:center">You've been added to SiteTrack Pro</h2>
      <p style="color:#57534e">Hi there,</p>
      <p style="color:#57534e">You have been added to <b>${esc(orgName)}</b> as <b>${esc(roleLabel)}</b>.</p>
      <p style="color:#57534e">Use the credentials below to sign in:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fafaf9;border-radius:8px;font-size:14px">
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Organization</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(orgName)}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Role</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(roleLabel)}</td></tr>
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
  const text = `You've been added to ${orgName} as ${roleLabel}.\n\nEmail: ${to}\nTemporary password: ${tempPassword}\n\nSign in: ${loginUrl}\n\nPlease change your password after first login.`;

  try {
    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: smtpUser, password: smtpPass } },
    });
    await client.send({
      from: `SiteTrack Pro <${smtpUser}>`,
      to,
      subject: `You've been added to ${orgName} on SiteTrack Pro`,
      content: text,
      html,
    });
    await client.close();
    console.log(`invite_org_member: email sent to ${to} via Gmail SMTP`);
    return true;
  } catch (e) {
    console.error(`invite_org_member: Gmail SMTP error for ${to}:`, e instanceof Error ? e.message : String(e));
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") || "";
    const cors = { ...CORS, "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0] ?? "*" };
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }

  const orgId = String(body.orgId ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const orgRole = String(body.orgRole ?? "architect");
  const identityRole = String(body.identityRole ?? "orgadmin");
  const name = body.name ? String(body.name) : undefined;
  const sendCredentials = body.sendCredentials !== false;

  if (!orgId || !email || !email.includes("@")) return json({ ok: false, error: "missing-fields" }, 400);
  if (!ORG_TIER_ROLES.includes(orgRole)) return json({ ok: false, error: "bad-org-role" }, 400);
  if (!VALID_IDENTITY_ROLES.includes(identityRole)) return json({ ok: false, error: "invalid-identity-role", message: `"${identityRole}" is not a valid identity role` }, 400);

  // ── Authorize: caller must be an admin of this org (or superadmin) ──
  const auth = await authenticate(req, { requireOrgId: orgId });
  if (!auth.ok) {
    const body = await auth.response.text();
    const h = new Headers(auth.response.headers);
    for (const [k, v] of Object.entries(CORS)) h.set(k, v);
    return new Response(body, { status: auth.response.status, statusText: auth.response.statusText, headers: h });
  }
  const isAdmin = auth.user.identityRole === "superadmin"
    || auth.orgMemberships.some(m => m.org_id === orgId && m.role === "admin");
  if (!isAdmin) return json({ ok: false, error: "not-org-admin" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in";
  const loginUrl = `${siteUrl}/accept-invite?email=${encodeURIComponent(email)}`;

  // ── 1. Create auth user (with temp password or invite) ──
  let newUserId: string | null = null;
  let tempPassword: string | undefined;
  let emailSent = false;

  if (sendCredentials) {
    tempPassword = generateTempPassword();
    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    });

    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return json({ ok: false, error: "already-exists", message: "This email already has an account — use Find to add them." }, 409);
      }
      if (msg.includes("invalid") && msg.includes("email")) {
        return json({ ok: false, error: "invalid-email", message: "That email address looks invalid — please check it." }, 400);
      }
      return json({ ok: false, error: "create-failed", message: "Could not create the user.", detail: createErr.message }, 502);
    }

    newUserId = createData?.user?.id || null;
  } else {
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { name } : {},
      redirectTo: `${siteUrl}/?shell=v3`,
    });

    if (invErr || !inv?.user) {
      const msg = (invErr?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return json({ ok: false, error: "already-exists", message: "This email already has an account — use Find to add them." }, 409);
      }
      if (msg.includes("invalid") && msg.includes("email")) {
        return json({ ok: false, error: "invalid-email", message: "That email address looks invalid — please check it." }, 400);
      }
      return json({ ok: false, error: "invite-failed", message: "Could not send the invite. Try again, or check the email.", detail: invErr?.message }, 502);
    }

    newUserId = inv.user.id;
  }

  if (!newUserId) return json({ ok: false, error: "user-id-missing" }, 502);

  // ── 2. Ensure profile row ──
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({ id: newUserId, name: name || email.split("@")[0] || "Member", role: identityRole }, { onConflict: "id", ignoreDuplicates: false });
  if (profileErr) {
    return json({ ok: false, error: "profile-upsert-failed", detail: profileErr.message }, 500);
  }

  // ── 3. Add them to the org at the chosen tier ──
  const { error: omErr } = await admin
    .from("org_members")
    .upsert({ org_id: orgId, profile_id: newUserId, role: orgRole, removed_at: null }, { onConflict: "org_id,profile_id" });
  if (omErr) {
    return json({ ok: false, error: "org-member-insert-failed", detail: omErr.message }, 500);
  }

  // ── 4. Send branded email with credentials + role info ──
  if (sendCredentials && tempPassword) {
    const { data: orgRow, error: orgNameErr } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    const orgName = orgRow?.name || "SiteTrack";
    emailSent = await sendRoleWelcomeEmail(email, orgName, orgRole, tempPassword, loginUrl);
  }

  return json({
    ok: true,
    invited: true,
    userId: newUserId,
    email,
    ...(sendCredentials && tempPassword ? { tempPassword, emailSent } : { invitedViaEmail: true }),
  }, 200);
});
