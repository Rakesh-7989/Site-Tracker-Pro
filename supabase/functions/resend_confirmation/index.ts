// SiteTrack Pro — resend the email-confirmation link for a self-service signup.
//
// The minimal /register screen creates an unconfirmed user (email_confirm:false).
// If the user didn't get the Supabase confirmation email, the verify screen
// offers "Resend" — this EF regenerates a fresh signup-confirmation link and
// emails it via Resend (the same branded sender as register_org). It also
// supports returning the link to an authorized caller if a future flow wants
// to deep-link the user without email.
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

const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

async function sendConfirmEmail(to: string, link: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:48px;height:48px;border-radius:12px;background:#ea580c;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700">S</div>
      </div>
      <h2 style="color:#1c1917;text-align:center">Confirm your SiteTrack Pro account</h2>
      <p style="color:#57534e">Hi there,</p>
      <p style="color:#57534e">Click the button below to confirm your email and activate your workspace.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${esc(link)}" style="background:#ea580c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
          Confirm my email
        </a>
      </p>
      <p style="color:#78716c;font-size:13px;text-align:center">If the button doesn't work, paste this link into your browser:<br/>${esc(link)}</p>
      <p style="color:#78716c;font-size:13px;text-align:center">- Team SiteTrack Pro</p>
    </div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: "Confirm your email to activate your workspace", html }),
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
  if (!email || !email.includes("@")) return json({ ok: false, error: "invalid-email" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Generate a fresh signup-confirmation link. Throws if the user is already
  // confirmed or doesn't exist — surface as a friendly error.
  let link: string;
  try {
    const { data, error } = await admin.auth.admin.generateLink("signup", email);
    if (error) throw error;
    const l = data?.properties?.action_link;
    if (!l) throw new Error("no action link");
    link = String(l);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (msg.includes("already") || msg.includes("confirmed") || msg.includes("verified")) {
      return json({ ok: false, error: "already-confirmed", message: "This email is already confirmed. Please sign in." }, 409);
    }
    if (msg.includes("not found") || msg.includes("no such user") || msg.includes("unable to find")) {
      return json({ ok: false, error: "no-user", message: "No account found for that email. Please sign up first." }, 404);
    }
    return json({ ok: false, error: "link-failed", message: "Could not generate a confirmation link. Please try again.", detail: e instanceof Error ? e.message : String(e) }, 502);
  }

  // Rate-limit resends lightly (best-effort) to avoid mailbox abuse.
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  if (ip) {
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const { count } = await admin
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gt("created_at", since);
    if ((count ?? 0) >= 3) {
      return json({ ok: false, error: "rate-limited", message: "Too many resend requests. Please wait a minute." }, 429);
    }
  }

  const emailSent = await sendConfirmEmail(email, link);

  return json({ ok: true, emailSent, email }, 200);
});
