// SiteTrack Pro — superadmin review of a signup request (approve / reject).
//
// APPROVE: create the org (on the requested plan), invite the applicant by email
// (creates the auth user; the mig-34 trigger makes a profile-only row — no 2nd
// org), add them as org admin, mark the request approved. The invite email is
// BRANDED via Resend when RESEND_API_KEY is set (generateLink + custom HTML);
// otherwise it falls back to Supabase's inviteUserByEmail (SMTP template).
//
// REJECT: mark rejected with optional notes (no account/org created).
//
// Auth: superadmin only. Deploy: `node scripts/deploy-edge-functions.mjs`.

// @ts-ignore — Deno URL import; resolved at runtime, not by Node tsc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

// @ts-ignore — Deno global.
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

async function sendBrandedInvite(to: string, firm: string, plan: string, link: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2 style="color:#ea580c">Welcome to SiteTrack Pro 🎉</h2>
      <p>Hi ${esc(firm)} team,</p>
      <p>Your workspace on the <b>${esc(PLAN_LABEL[plan] || plan)}</b> plan is approved and ready.
         Click below to set your password and sign in.</p>
      <p style="margin:28px 0">
        <a href="${link}" style="background:#ea580c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">
          Set password &amp; enter workspace
        </a>
      </p>
      <p style="color:#78716c;font-size:13px">If the button doesn't work, copy this link:<br>${esc(link)}</p>
      <p style="color:#78716c;font-size:13px">— Team SiteTrack Pro</p>
    </div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: "Your SiteTrack Pro workspace is ready", html }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  const auth = await authenticate(req, { requireRole: ["superadmin"] });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  const requestId = String(body.requestId ?? "");
  const action = String(body.action ?? "");
  const notes = body.notes ? String(body.notes).slice(0, 1000) : null;
  if (!requestId || !["approve", "reject"].includes(action)) return json({ ok: false, error: "bad-input" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: reqRow, error: rErr } = await admin
    .from("signup_requests").select("*").eq("id", requestId).maybeSingle();
  if (rErr) return json({ ok: false, error: "lookup-failed", detail: rErr.message }, 500);
  if (!reqRow) return json({ ok: false, error: "not-found" }, 404);
  if (reqRow.status !== "pending") return json({ ok: false, error: "already-reviewed", message: `Request is already ${reqRow.status}.` }, 409);

  // ── REJECT ──
  if (action === "reject") {
    const { error } = await admin.from("signup_requests")
      .update({ status: "rejected", review_notes: notes, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) return json({ ok: false, error: "update-failed", detail: error.message }, 500);
    return json({ ok: true, action: "rejected" }, 200);
  }

  // ── APPROVE ──
  const firm = String(reqRow.firm_name);
  const email = String(reqRow.email).toLowerCase();
  const plan = String(reqRow.plan);
  const contact = String(reqRow.contact_name);
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrack-rakesh.vercel.app").replace(/\/+$/, "");
  const redirectTo = `${siteUrl}/login`;

  // 1. Create the org on the requested plan. Attribute it to the staff member
  //    who approved the request (organizations.created_by_staff, migration 99).
  const { data: org, error: orgErr } = await admin
    .from("organizations").insert({ slug: slugify(firm), name: firm, plan, created_by_staff: auth.user.id }).select("id").single();
  if (orgErr) return json({ ok: false, error: "org-create-failed", detail: orgErr.message }, 500);
  const orgId = String(org.id);

  // 2. Create the auth user + an invite link.
  let userId: string | null = null;
  let emailSent = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite", email, options: { redirectTo, data: { name: contact } },
    });
    if (linkErr || !linkData?.user) {
      const m = (linkErr?.message || "").toLowerCase();
      await admin.from("organizations").delete().eq("id", orgId); // roll back the org
      if (m.includes("already") || m.includes("exist") || m.includes("registered"))
        return json({ ok: false, error: "email-exists", message: "This email already has an account — add them to a new org manually instead." }, 409);
      return json({ ok: false, error: "invite-link-failed", detail: linkErr?.message }, 502);
    }
    userId = linkData.user.id;
    emailSent = await sendBrandedInvite(email, firm, plan, String(linkData.properties?.action_link ?? redirectTo));
  } else {
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { data: { name: contact }, redirectTo });
    if (invErr || !inv?.user) {
      const m = (invErr?.message || "").toLowerCase();
      await admin.from("organizations").delete().eq("id", orgId);
      if (m.includes("already") || m.includes("exist") || m.includes("registered"))
        return json({ ok: false, error: "email-exists", message: "This email already has an account — add them to a new org manually instead." }, 409);
      return json({ ok: false, error: "invite-failed", detail: invErr?.message }, 502);
    }
    userId = inv.user.id;
    emailSent = true; // Supabase sent it via SMTP
  }

  // 3. Make them the org admin.
  const { error: omErr } = await admin.from("org_members")
    .upsert({ org_id: orgId, profile_id: userId, role: "admin", removed_at: null }, { onConflict: "org_id,profile_id" });
  if (omErr) return json({ ok: false, error: "org-member-failed", detail: omErr.message }, 500);

  // 4. Mark the request approved + link the org.
  const { error: updErr } = await admin.from("signup_requests")
    .update({ status: "approved", review_notes: notes, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), created_org_id: orgId })
    .eq("id", requestId);
  if (updErr) return json({ ok: false, error: "finalize-failed", detail: updErr.message }, 500);

  return json({ ok: true, action: "approved", orgId, userId, emailSent }, 200);
});
