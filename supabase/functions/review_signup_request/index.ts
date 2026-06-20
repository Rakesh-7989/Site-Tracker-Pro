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

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };

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

async function ensureApplicantProfile(admin, userId: string, contact: string, email: string) {
  const name = contact.trim() || email.split("@")[0] || "SiteTrack user";
  return await admin
    .from("profiles")
    .upsert({ id: userId, name, role: "client" }, { onConflict: "id", ignoreDuplicates: true });
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
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (resendKey) {
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { name: contact } },
    });

    if (inviteErr || !inviteData?.user) {
      if (!isAlreadyRegistered(inviteErr?.message)) {
        await rollbackOrg();
        return json({ ok: false, error: "invite-link-failed", detail: inviteErr?.message }, 502);
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
    } else {
      userId = inviteData.user.id;
      emailSent = await sendBrandedInvite(email, firm, plan, String(inviteData.properties?.action_link ?? redirectTo));
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

  const { error: profileErr } = await ensureApplicantProfile(admin, userId, contact, email);
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

  const { error: updErr } = await admin
    .from("signup_requests")
    .update({ status: "approved", review_notes: notes, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), created_org_id: orgId })
    .eq("id", requestId);
  if (updErr) {
    await rollbackOrg();
    return json({ ok: false, error: "finalize-failed", detail: updErr.message }, 500);
  }

  return json({ ok: true, action: "approved", orgId, userId, emailSent, existingUser }, 200);
});
