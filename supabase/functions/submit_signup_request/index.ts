// SiteTrack Pro — public signup request (approval-gated onboarding).
//
// A visitor on the landing page picks a plan + submits firm/contact/email.
// This PUBLIC function (no JWT) validates + inserts a 'pending' row into
// signup_requests via the service role, then emails the founder an alert.
// No org / account is created here — that happens only on superadmin approval
// (review_signup_request). Zero new spend (Resend free tier; alert optional).
//
// Deploy: `node scripts/deploy-edge-functions.mjs`.

// @ts-ignore — Deno URL import; resolved at runtime, not by Node tsc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-ignore — Deno global.
declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PLANS = ["basic", "pro", "business", "custom"];
const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return; // alert is best-effort; absence is not fatal to the signup
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch { /* swallow — never block the signup on a mail hiccup */ }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }

  const firmName = String(body.firmName ?? "").trim();
  const contactName = String(body.contactName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = body.phone ? String(body.phone).trim() : null;
  const plan = String(body.plan ?? "basic").trim();
  const message = body.message ? String(body.message).trim().slice(0, 1000) : null;
  const consentVersion = body.consentVersion ? String(body.consentVersion).slice(0, 40) : null;
  // Honeypot: a hidden field real users never fill. Bots do → pretend success,
  // insert nothing.
  const honeypot = String(body.website ?? "").trim();
  if (honeypot) return json({ ok: true }, 200);

  if (!firmName || !contactName) return json({ ok: false, error: "missing-fields", message: "Firm name and your name are required." }, 400);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "invalid-email", message: "Please enter a valid work email." }, 400);
  if (!PLANS.includes(plan)) return json({ ok: false, error: "bad-plan" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Source IP for rate-limiting (first hop in x-forwarded-for).
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  // Throttle: max 5 signup requests per IP per hour.
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("signup_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gt("created_at", since);
    if ((count ?? 0) >= 5) {
      return json({ ok: false, error: "rate-limited", message: "Too many requests from your network. Please try again later." }, 429);
    }
  }

  // Insert the pending request. The partial unique index blocks a 2nd pending
  // row for the same email → friendly 409.
  const { data: row, error } = await admin
    .from("signup_requests")
    .insert({ firm_name: firmName, contact_name: contactName, email, phone, plan, message, ip, consent_version: consentVersion, status: "pending" })
    .select("id")
    .single();

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("uq_signup_pending_email") || msg.includes("duplicate")) {
      return json({ ok: false, error: "already-pending", message: "We've already got a request from this email — we'll be in touch soon." }, 409);
    }
    return json({ ok: false, error: "insert-failed", detail: error.message }, 500);
  }

  // Best-effort founder alert.
  const alertTo = Deno.env.get("SIGNUP_ALERT_EMAIL");
  if (alertTo) {
    await sendEmail(
      alertTo,
      `New SiteTrack signup: ${firmName} (${plan})`,
      `<h2>New signup request</h2>
       <p><b>Firm:</b> ${esc(firmName)}</p>
       <p><b>Contact:</b> ${esc(contactName)} &lt;${esc(email)}&gt;${phone ? ` · ${esc(phone)}` : ""}</p>
       <p><b>Plan:</b> ${esc(plan)}</p>
       ${message ? `<p><b>Message:</b> ${esc(message)}</p>` : ""}
       <p>Review + approve in the Signup Requests queue.</p>`,
    );
  }

  return json({ ok: true, id: row.id }, 200);
});
