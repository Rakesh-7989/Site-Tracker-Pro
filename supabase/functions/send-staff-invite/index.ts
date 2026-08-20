// SiteTrack Pro — create a single-use staff invite AND email the join link.
//
// Caller must be the platform Owner or Head. We mint the invite (service role),
// then send the /staff/join link to the invitee via the project's Gmail SMTP
// (GMAIL_SMTP_USER / GMAIL_SMTP_PASS function secrets). If the email send fails
// we still return the token so the UI can fall back to "copy link". Zero spend.
//
// Deploy: npx supabase functions deploy send-staff-invite --project-ref nntkxojdeyziemdhyjvg

// @ts-ignore — Deno URL import.
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const tier = body.tier === "head" ? "head" : "member";
  if (!email || !email.includes("@")) return json({ ok: false, error: "missing-email" }, 400);

  // Authenticate the caller, then confirm staff tier.
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: me } = await admin.from("profiles").select("staff_tier").eq("id", auth.user.id).maybeSingle();
  const myTier = (me as { staff_tier?: string } | null)?.staff_tier;
  if (myTier !== "owner" && myTier !== "head") return json({ ok: false, error: "not-staff-admin" }, 403);
  if (tier === "head" && myTier !== "owner") return json({ ok: false, error: "only-owner-mints-head" }, 403);

  // Mint the invite.
  const { data: inv, error: invErr } = await admin
    .from("staff_invites").insert({ email, tier, created_by: auth.user.id })
    .select("token").single();
  if (invErr || !inv) return json({ ok: false, error: "invite-failed", detail: invErr?.message }, 500);
  const token = String(inv.token);

  const site = Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in";
  const link = `${site}/staff/join?token=${encodeURIComponent(token)}`;

  // Email the link via Gmail SMTP (best-effort).
  let emailSent = false;
  const smtpUser = Deno.env.get("GMAIL_SMTP_USER");
  const smtpPass = Deno.env.get("GMAIL_SMTP_PASS");
  if (smtpUser && smtpPass) {
    try {
      const client = new SMTPClient({
        connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: smtpUser, password: smtpPass } },
      });
      await client.send({
        from: `SiteTrack Pro <${smtpUser}>`,
        to: email,
        subject: "You're invited to join SiteTrack Pro staff",
        content: `You've been invited as a SiteTrack Pro platform staff member.\n\nSet up your account here (one-time link, expires in 7 days):\n${link}\n\nIf you didn't expect this, you can ignore this email.`,
        html: `<p>You've been invited as a <b>SiteTrack Pro</b> platform staff member.</p>
<p><a href="${link}" style="background:#FF6B1A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Set up your account</a></p>
<p style="color:#666;font-size:13px">Or paste this one-time link (expires in 7 days):<br>${link}</p>
<p style="color:#999;font-size:12px">If you didn't expect this, ignore this email.</p>`,
      });
      await client.close();
      emailSent = true;
    } catch (_) {
      emailSent = false; // fall back to copy-link in the UI
    }
  }

  return json({ ok: true, token, emailSent }, 200);
});
