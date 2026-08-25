// Edge Function: cashfree-checkout — one-time payment for a NEW org signup.
//
// A prospect picks a paid plan on the public site → submits a signup request →
// then pays here. We create a Cashfree PAYMENT LINK (hosted page: cards, UPI,
// debit, netbanking) at the PLATFORM level (founder's Cashfree account, not a
// per-org account) and return its URL. On payment, Cashfree calls
// cashfree-webhook → the signup_request is marked paid (Phase C 24h SLA starts).
//
// Public (the payer has no app account yet) — the signup_request id is the ref.
// TEST mode by default (CASHFREE_ENV != "production" → sandbox.cashfree.com).
//
// Secrets needed (set via `supabase secrets set`):
//   CASHFREE_APP_ID, CASHFREE_SECRET, CASHFREE_ENV (test|production)
//
// Deploy: npx supabase functions deploy cashfree-checkout --project-ref nntkxojdeyziemdhyjvg --no-verify-jwt

// @ts-ignore — Deno URL import.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cashfreeBaseUrl } from "../_shared/cashfree.ts";

// @ts-ignore — Deno global.
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
const json = (d: unknown, s: number): Response => new Response(JSON.stringify(d), { status: s, headers: { ...CORS(), "Content-Type": "application/json" } });

const GST = 0.18;

Deno.serve(async (req: Request): Promise<Response> => {
  REQ = req;
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  const requestId = String(body.signupRequestId ?? "");
  const period = body.period === "monthly" ? "monthly" : "annual";
  if (!requestId) return json({ ok: false, error: "missing-signup-request" }, 400);

  const appId = Deno.env.get("CASHFREE_APP_ID");
  const secret = Deno.env.get("CASHFREE_SECRET");
  const cfEnv = Deno.env.get("CASHFREE_ENV") || "test";
  if (!appId || !secret) return json({ ok: false, error: "cashfree-not-configured", message: "Set CASHFREE_APP_ID + CASHFREE_SECRET secrets first." }, 503);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Look up the signup request + the plan price.
  const { data: reqRow } = await admin.from("signup_requests").select("id, firm_name, contact_name, email, phone, plan, payment_status").eq("id", requestId).maybeSingle();
  if (!reqRow) return json({ ok: false, error: "request-not-found" }, 404);
  if ((reqRow as { payment_status?: string }).payment_status === "paid") return json({ ok: false, error: "already-paid" }, 409);

  const plan = String((reqRow as { plan?: string }).plan ?? "basic");
  const { data: planRow } = await admin.from("plans").select("monthly_inr, yearly_inr").eq("id", plan).maybeSingle();
  const paise = period === "annual" ? Number((planRow as { yearly_inr?: number })?.yearly_inr ?? 0) : Number((planRow as { monthly_inr?: number })?.monthly_inr ?? 0);
  if (!paise) return json({ ok: false, error: "no-price", message: `No price for plan ${plan}.` }, 400);
  const amount = Math.round((paise / 100) * (1 + GST)); // INR incl. 18% GST

  const base = cashfreeBaseUrl({ env: cfEnv });
  const linkId = `st_${requestId.slice(0, 8)}_${plan}_${period}`.replace(/[^a-zA-Z0-9_]/g, "");
  const site = Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in";

  const r = await fetch(`${base}/links`, {
    method: "POST",
    headers: { "x-client-id": appId, "x-client-secret": secret, "x-api-version": "2023-08-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      link_id: `${linkId}_${Date.now().toString(36)}`,
      link_amount: amount,
      link_currency: "INR",
      link_purpose: `SiteTrack Pro — ${plan} (${period})`,
      customer_details: {
        customer_name: String((reqRow as { contact_name?: string }).contact_name ?? "Customer"),
        customer_email: String((reqRow as { email?: string }).email ?? ""),
        customer_phone: String((reqRow as { phone?: string }).phone ?? "9999999999"),
      },
      link_notify: { send_email: true, send_sms: false },
      link_meta: { return_url: `${site}/signup?paid=1`, notify_url: `${url}/functions/v1/cashfree-webhook`, signup_request_id: requestId },
      link_auto_reminders: true,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.link_url) {
    return json({ ok: false, error: "link-failed", detail: j.message || `HTTP ${r.status}` }, 502);
  }

  // Stash the link id on the request so the webhook can reconcile it.
  await admin.from("signup_requests").update({ payment_ref: j.link_id }).eq("id", requestId);

  return json({ ok: true, linkUrl: j.link_url, linkId: j.link_id, amount, env: cfEnv }, 200);
});
