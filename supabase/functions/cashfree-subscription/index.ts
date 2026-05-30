// Edge Function: cashfree-subscription
//
// Browser POSTs { org_id, plan, return_url }. We:
//   1. Look up the org's Cashfree creds from org_integrations (service_role
//      bypasses RLS, so we can read the secret app_id/secret pair).
//   2. Build the Cashfree subscription request via shared helpers.
//   3. Forward to Cashfree, get a subscription_session_id back.
//   4. Upsert a pending row into the `subscriptions` table.
//   5. Return { subscription_id, subscription_session_id } to the browser
//      so it can open Cashfree's hosted UPI-mandate UI.
//
// Deploy:
//   supabase functions deploy cashfree-subscription
// Test:
//   curl -X POST https://<proj>.supabase.co/functions/v1/cashfree-subscription \
//     -H "Authorization: Bearer <user JWT>" \
//     -H "Content-Type: application/json" \
//     -d '{"org_id":"...","plan":"pro","return_url":"https://app.sitetrack.in/"}'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSubscriptionRequest,
  cashfreeBaseUrl,
  isCashfreeConfigured,
} from "../_shared/cashfree.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { org_id?: string; plan?: string; return_url?: string };
  try { body = await req.json(); }
  catch { return json({ error: "invalid JSON body" }, 400); }

  const { org_id, plan, return_url } = body || {};
  if (!org_id) return json({ error: "org_id required" }, 400);
  if (!plan) return json({ error: "plan required" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Edge env not set" }, 500);
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Authenticate the caller (must be the orgadmin of this org)
  const authHeader = req.headers.get("Authorization") || "";
  const userJwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!userJwt) return json({ error: "missing Authorization header" }, 401);
  const { data: { user }, error: authErr } = await supa.auth.getUser(userJwt);
  if (authErr || !user) return json({ error: "invalid token" }, 401);

  // Look up the caller's org + role from profiles + org_members
  const { data: profile } = await supa.from("profiles").select("role").eq("id", user.id).single();
  const { data: membership } = await supa.from("org_members").select("org_id").eq("profile_id", user.id).eq("org_id", org_id).maybeSingle();
  const isAuthorised = profile?.role === "superadmin" || (profile?.role === "orgadmin" && membership);
  if (!isAuthorised) return json({ error: "only orgadmin or superadmin can manage subscriptions" }, 403);

  // 2. Load Cashfree creds for the org
  const { data: integ } = await supa.from("org_integrations").select("cashfree").eq("org_id", org_id).single();
  const cfg = integ?.cashfree as { app_id?: string; secret?: string; env?: string } | undefined;
  if (!isCashfreeConfigured(cfg || null)) {
    return json({ error: "Cashfree not configured for this org. Set app_id + secret in Integrations." }, 400);
  }

  // 3. Load org details for the customer_details payload
  const { data: org } = await supa.from("organizations").select("id, name, contact_email").eq("id", org_id).single();
  if (!org) return json({ error: "org not found" }, 404);

  // 4. Build the request
  let req2;
  try { req2 = buildSubscriptionRequest(org, plan as never, return_url || ""); }
  catch (e) { return json({ error: String((e as Error).message) }, 400); }

  // 5. Forward to Cashfree
  const cfRes = await fetch(`${cashfreeBaseUrl(cfg!)}/subscriptions`, {
    method: "POST",
    headers: {
      "x-client-id": cfg!.app_id!,
      "x-client-secret": cfg!.secret!,
      "x-api-version": "2025-01-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req2.payload),
  });
  const cfJson = await cfRes.json().catch(() => ({}));
  if (!cfRes.ok) {
    console.warn("Cashfree rejected subscription:", cfRes.status, cfJson);
    return json({ error: "cashfree_error", details: cfJson }, cfRes.status);
  }

  // 6. Record the pending subscription locally
  await supa.from("subscriptions").upsert({
    org_id,
    provider: "cashfree",
    external_id: req2.subscription_id,
    plan,
    status: "pending",
    updated_at: new Date().toISOString(),
  });

  // 7. Audit
  await supa.rpc("record_audit_v2", {
    p_action: "PAYMENT",
    p_resource: "subscription",
    p_resource_id: org_id,
    p_project_id: null,
    p_before: null,
    p_after: { plan, subscription_id: req2.subscription_id },
    p_message: `Cashfree subscription intent: ${org_id} → ${plan} (pending mandate)`,
  }).catch((e) => console.warn("audit failed:", e));

  return json({
    subscription_id: req2.subscription_id,
    subscription_session_id: cfJson.subscription_session_id,
    cashfree: cfJson,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
