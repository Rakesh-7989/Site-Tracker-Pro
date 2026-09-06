// Edge Function: cashfree-plan-link — one-time plan payment for an EXISTING org.
//
// An orgadmin on trial/basic/pro picks a paid plan (basic/pro/business) +
// period in /org/billing → we mint a platform-level Cashfree PAYMENT LINK
// (founder's Cashfree account, same as cashfree-checkout — the org needs NO
// Cashfree account of its own) and stash a pending row in `plan_payments`
// (migration 257). On payment, cashfree-webhook settles the row and
// ACTIVATES the plan (organizations.plan + subscriptions + billing_history).
//
// Why one-time links and not mandates: existing-org upgrade was ticket-only
// (no money moved, closed ticket ≠ activation) and cashfree-subscription has
// no UI caller + demands per-org Cashfree creds + a Business+ gate — the
// wrong model for self-serve SaaS. One-time links per billing period reuse
// the proven signup payment path.
//
// Public? No — requires the caller's user JWT (orgadmin of the org or
// superadmin). Throttled 5/hr/IP like the other public-ish money endpoints.
//
// Deploy: supabase functions deploy cashfree-plan-link
// Secrets: CASHFREE_APP_ID, CASHFREE_SECRET, CASHFREE_ENV (test|production)

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
const VALID_PLANS = ["basic", "pro", "business"] as const;
// Downgrades stay manual (support) — self-serve covers upgrades + renewals.
const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, business: 3, enterprise: 4, custom: 4 };

Deno.serve(async (req: Request): Promise<Response> => {
  REQ = req;
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS() });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  const orgId = String(body.org_id ?? "");
  const plan = String(body.plan ?? "");
  const period = body.period === "annual" ? "annual" : "monthly";
  if (!orgId) return json({ ok: false, error: "org_id required" }, 400);
  if (!(VALID_PLANS as readonly string[]).includes(plan)) {
    return json({ ok: false, error: "unsupported-plan", message: "Self-serve covers basic, pro and business. Enterprise/custom are negotiated manually — contact sales." }, 400);
  }

  const appId = Deno.env.get("CASHFREE_APP_ID");
  const secret = Deno.env.get("CASHFREE_SECRET");
  const cfEnv = Deno.env.get("CASHFREE_ENV") || "test";
  if (!appId || !secret) return json({ ok: false, error: "cashfree-not-configured", message: "Set CASHFREE_APP_ID + CASHFREE_SECRET secrets first." }, 503);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Authenticate: orgadmin of this org, or superadmin.
  const userJwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!userJwt) return json({ ok: false, error: "missing Authorization header" }, 401);
  const { data: { user }, error: authErr } = await admin.auth.getUser(userJwt);
  if (authErr || !user) return json({ ok: false, error: "invalid token" }, 401);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const { data: membership } = await admin.from("org_members").select("role").eq("profile_id", user.id).eq("org_id", orgId).maybeSingle();
  const isAuthorised = (profile as { role?: string } | null)?.role === "superadmin" || (membership as { role?: string } | null)?.role === "admin";
  if (!isAuthorised) return json({ ok: false, error: "only orgadmin or superadmin can buy a plan" }, 403);

  // Org + current plan (downgrades stay manual).
  const { data: org } = await admin.from("organizations").select("id, name, contact_email, plan").eq("id", orgId).maybeSingle();
  if (!org) return json({ ok: false, error: "org-not-found" }, 404);
  const currentPlan = String((org as { plan?: string }).plan ?? "basic");
  if ((PLAN_RANK[plan] ?? -1) < (PLAN_RANK[currentPlan] ?? 0)) {
    return json({ ok: false, error: "downgrade-manual", message: `Moving from ${currentPlan} to ${plan} is handled by support so nothing breaks mid-cycle. Please contact us.` }, 400);
  }

  // Throttle: max 5 plan-link mints per org per hour (money endpoint).
  // Per-org (not per-IP) so shared office networks are not blocked together.
  {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("plan_payments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gt("created_at", since);
    if ((count ?? 0) >= 5) {
      return json({ ok: false, error: "rate-limited", message: "Too many payment attempts. Please try again later." }, 429);
    }
  }

  // Price from the DB plans table (charge truth, migration 93) + 18% GST.
  const { data: planRow } = await admin.from("plans").select("monthly_inr, yearly_inr").eq("id", plan).maybeSingle();
  const paise = period === "annual"
    ? Number((planRow as { yearly_inr?: number } | null)?.yearly_inr ?? 0)
    : Number((planRow as { monthly_inr?: number } | null)?.monthly_inr ?? 0);
  if (!paise) return json({ ok: false, error: "no-price", message: `No price for plan ${plan}.` }, 400);
  const amount = Math.round((paise / 100) * (1 + GST)); // INR incl. 18% GST

  const base = cashfreeBaseUrl({ env: cfEnv });
  const linkId = `st_plan_${orgId.slice(0, 8)}_${plan}_${period}`.replace(/[^a-zA-Z0-9_]/g, "");
  const site = Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in";

  const r = await fetch(`${base}/links`, {
    method: "POST",
    headers: { "x-client-id": appId, "x-client-secret": secret, "x-api-version": "2023-08-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      link_id: `${linkId}_${Date.now().toString(36)}`,
      link_amount: amount,
      link_currency: "INR",
      link_purpose: `SiteTrack Pro — ${plan} (${period}) for ${(org as { name?: string }).name || "workspace"}`,
      customer_details: {
        customer_name: String((org as { name?: string }).name ?? "Customer"),
        customer_email: String((org as { contact_email?: string }).contact_email ?? user.email ?? ""),
        customer_phone: "9999999999",
      },
      link_notify: { send_email: true, send_sms: false },
      link_meta: {
        return_url: `${site}/org/billing?paid=1`,
        notify_url: `${url}/functions/v1/cashfree-webhook`,
        type: "plan_upgrade",
        org_id: orgId,
        plan,
        period,
      },
      link_auto_reminders: true,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.link_url) {
    return json({ ok: false, error: "link-failed", detail: j.message || `HTTP ${r.status}` }, 502);
  }

  // Stash the pending payment so the webhook can settle + activate it.
  // amount_paise stores the GST-INCLUSIVE paise actually charged.
  const amountPaise = Math.round(amount * 100);
  const { error: stashErr } = await admin.from("plan_payments").insert({
    org_id: orgId,
    plan,
    period,
    amount_paise: amountPaise,
    link_id: String(j.link_id),
    status: "pending",
  });
  if (stashErr) {
    console.error("plan_payments stash failed:", stashErr);
    return json({ ok: false, error: "stash-failed", message: "Payment link created but could not be recorded. Please contact support before paying." }, 500);
  }

  return json({ ok: true, linkUrl: j.link_url, linkId: j.link_id, amount, env: cfEnv }, 200);
});
