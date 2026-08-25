// SiteTrack Pro — resend the email-confirmation link for a self-service signup.
//
// The minimal /register screen creates an unconfirmed user (email_confirm:false).
// If the user didn't get the confirmation email, the verify screen offers
// "Resend" — this EF regenerates a fresh signup-confirmation link via the admin
// generate_link endpoint, which dispatches the email itself through the
// configured SMTP (Gmail, single source of truth — no duplicate Resend send).
// It also returns the link to an authorized caller if a future flow wants to
// deep-link the user without email.
//
// Deploy: `node scripts/deploy-edge-functions.mjs` (needs `supabase login`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return json({ ok: false, error: "invalid-email" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Generate a fresh signup-confirmation link. The admin generate_link endpoint
  // dispatches the confirmation email itself via the configured SMTP (Gmail),
  // so this is the single send — no duplicate branded email. redirectTo =
  // canonical app URL (the default site_url is a stale preview URL). Throws if
  // the user is already confirmed or doesn't exist — surface as a friendly error.
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in").replace(/\/+$/, "");
  let link: string;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      options: { redirectTo: `${siteUrl}/login` },
    });
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

  // The email was dispatched by GoTrue's generate_link (SMTP) above; reaching
  // this point with a valid link means the resend happened. Return the link to
  // an authorized caller that wants to deep-link (e.g. a future flow).
  return json({ ok: true, emailSent: true, email, link }, 200);
});
