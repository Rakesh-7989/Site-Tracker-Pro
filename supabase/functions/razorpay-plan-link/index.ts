// SiteTrack Pro — create a Razorpay Payment Link for a paid-plan upgrade.
//
// Upon Rail (orgadmin/superadmin) calls this to mint a shareable Razorpay
// payment link for an upgrade/renewal to basic/pro/business. The link is
// posted to the Razorpay API and the intent is stashed in `plan_payments` so
// the webhook can settle + activate the plan when the payment lands.
//
// Replaces the Cashfree `cashfree-plan-link` EF (Cashfree is no longer the
// plan-payment rail); invoices keep the per-org `razorpay-payment-link` EF.
//
// Deploy:
//   supabase functions deploy razorpay-plan-link
//
// Then call from the frontend:
//   POST /functions/v1/razorpay-plan-link
//   { org_id, plan, period }   (period: "monthly" | "annual")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { RAZORPAY_BASE, base64Credentials } from "../_shared/razorpay.ts";

const GST = 0.18;
const VALID_PLANS = ["basic", "pro", "business"] as const;
// Downgrades stay manual (support) — self-serve covers upgrades + renewals.
const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, business: 3, enterprise: 4, custom: 4 };

interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
}

const json = (d: unknown, s: number, req: Request): Response =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405, req);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400, req); }
  const orgId = String(body.org_id ?? "");
  const plan = String(body.plan ?? "");
  const period = body.period === "annual" ? "annual" : "monthly";
  if (!orgId) return json({ ok: false, error: "org_id required" }, 400, req);
  if (!(VALID_PLANS as readonly string[]).includes(plan)) {
    return json({ ok: false, error: "unsupported-plan", message: "Self-serve covers basic, pro and business. Enterprise/custom are negotiated manually — contact sales." }, 400, req);
  }

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !secret) return json({ ok: false, error: "razorpay-not-configured", message: "Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET secrets first." }, 503, req);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500, req);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Authenticate: must hold an (expected) membership in this org (or be
  // platform staff) — cross-tenant IDOR guard for a money endpoint.
  const auth = await authenticate(req, { requireOrgId: orgId });
  if (!auth.ok) return auth.response;

  // Authz: orgadmin of this org, or superadmin identity (mirrors
  // cashfree-plan-link's profile.role === "superadmin" check).
  const isSuperadmin = auth.user.identityRole === "superadmin";
  const isOrgAdmin = auth.orgMemberships.some((m) => m.org_id === orgId && m.role === "admin");
  if (!isSuperadmin && !isOrgAdmin) {
    return json({ ok: false, error: "only orgadmin or superadmin can buy a plan" }, 403, req);
  }

  // Org + current plan (downgrades stay manual).
  const { data: org } = await admin.from("organizations").select("id, name, contact_email, plan").eq("id", orgId).maybeSingle();
  if (!org) return json({ ok: false, error: "org-not-found" }, 404, req);
  const currentPlan = String((org as { plan?: string }).plan ?? "basic");
  if ((PLAN_RANK[plan] ?? -1) < (PLAN_RANK[currentPlan] ?? 0)) {
    return json({ ok: false, error: "downgrade-manual", message: `Moving from ${currentPlan} to ${plan} is handled by support so nothing breaks mid-cycle. Please contact us.` }, 400, req);
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
      return json({ ok: false, error: "rate-limited", message: "Too many payment attempts. Please try again later." }, 429, req);
    }
  }

  // Price from the DB plans table (charge truth, migration 93) + 18% GST.
  const { data: planRow } = await admin.from("plans").select("monthly_inr, yearly_inr").eq("id", plan).maybeSingle();
  const paise = period === "annual"
    ? Number((planRow as { yearly_inr?: number } | null)?.yearly_inr ?? 0)
    : Number((planRow as { monthly_inr?: number } | null)?.monthly_inr ?? 0);
  if (!paise) return json({ ok: false, error: "no-price", message: `No price for plan ${plan}.` }, 400, req);
  const amount = Math.round((paise / 100) * (1 + GST)); // INR incl. 18% GST
  const amountPaise = Math.round(amount * 100); // GST-inclusive paise actually charged

  // Stash the pending intent BEFORE the Razorpay call. Notes are immutable
  // once a payment link exists, so the webhook resolves by
  // `notes.sitetrack_plan_payment_id` (this row's id); `link_id` is
  // NOT NULL UNIQUE, so seed a placeholder and backfill after creation.
  const ppId = crypto.randomUUID();
  const { error: stashErr } = await admin.from("plan_payments").insert({
    org_id: orgId,
    plan,
    period,
    amount_paise: amountPaise,
    link_id: `razorpay_${ppId}`,
    status: "pending",
  });
  if (stashErr) {
    console.error("plan_payments stash failed:", stashErr);
    return json({ ok: false, error: "stash-failed", message: "Payment intent could not be recorded. Please try again." }, 500, req);
  }

  const site = Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in";

  const razorpayPayload: Record<string, unknown> = {
    amount: amountPaise,
    currency: "INR",
    description: `SiteTrack Pro — ${plan} (${period}) for ${(org as { name?: string }).name || "workspace"}`,
    customer: {
      name: String((org as { name?: string }).name ?? "Customer"),
      email: String((org as { contact_email?: string }).contact_email ?? auth.user.email ?? ""),
    },
    notify: { sms: false, email: true },
    reminder_enable: true,
    notes: {
      type: "plan_upgrade",
      sitetrack_plan_payment_id: ppId,
      sitetrack_org_id: orgId,
      sitetrack_plan: plan,
      sitetrack_period: period,
    },
    callback_url: `${site.replace(/\/+$/, "")}/org/billing?paid=1`,
    callback_method: "get",
  };

  let razorpayResponse: RazorpayPaymentLink;
  try {
    const res = await fetch(`${RAZORPAY_BASE}/payment_links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${base64Credentials(keyId, secret)}`,
      },
      body: JSON.stringify(razorpayPayload),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.warn("razorpay create plan link failed:", res.status, errBody);
      await admin.from("plan_payments").update({ status: "cancelled" }).eq("id", ppId).then(() => {}, () => {});
      return json({ ok: false, error: "link-failed", detail: errBody || `HTTP ${res.status}` }, 502, req);
    }
    razorpayResponse = await res.json() as RazorpayPaymentLink;
  } catch (e) {
    console.error("razorpay fetch error:", e);
    await admin.from("plan_payments").update({ status: "cancelled" }).eq("id", ppId).then(() => {}, () => {});
    return json({ ok: false, error: "razorpay-fetch-failed", detail: e instanceof Error ? e.message : String(e) }, 502, req);
  }

  // Backfill the real Razorpay payment link id. Non-fatal: the webhook
  // still resolves the pending row via notes.sitetrack_plan_payment_id.
  const { error: updateErr } = await admin
    .from("plan_payments")
    .update({ link_id: razorpayResponse.id })
    .eq("id", ppId);
  if (updateErr) {
    console.error("Failed to backfill plan_payments.link_id:", updateErr);
  }

  return json({ ok: true, link_url: razorpayResponse.short_url, link_id: razorpayResponse.id, amount, env: "razorpay" }, 200, req);
});