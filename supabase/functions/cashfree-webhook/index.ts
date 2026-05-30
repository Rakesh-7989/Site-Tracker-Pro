// Edge Function: cashfree-webhook
//
// Cashfree POSTs lifecycle events here (mandate signed, payment succeeded,
// payment failed, subscription cancelled). We:
//   1. Verify the HMAC-SHA256 signature using the WEBHOOK secret.
//   2. Map the event to a subscription row update via applyWebhookEvent().
//   3. Upsert into `subscriptions` (service_role bypasses RLS).
//   4. Record an audit_log_v2 entry via the SECURITY DEFINER RPC.
//
// Deploy:
//   supabase functions deploy cashfree-webhook --no-verify-jwt
//   (no-verify-jwt because Cashfree doesn't send a Supabase JWT)
//
// Then in the Cashfree dashboard, set the webhook URL to:
//   https://<proj>.supabase.co/functions/v1/cashfree-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyWebhookSignature,
  applyWebhookEvent,
} from "../_shared/cashfree.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return text("POST only", 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const WEBHOOK_SECRET = Deno.env.get("CASHFREE_WEBHOOK_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE || !WEBHOOK_SECRET) {
    return text("Edge env not configured", 500);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";

  // Verify signature first — drop anything that fails (replay-attack resistant
  // because timestamp+body are signed together).
  const ok = await verifyWebhookSignature({ rawBody, timestamp, signature, secret: WEBHOOK_SECRET });
  if (!ok) {
    console.warn("Cashfree webhook signature invalid", { timestamp, sigPrefix: signature.slice(0, 8) });
    return text("Invalid signature", 401);
  }

  let event: { type?: string; event_type?: string; data?: { subscription?: { subscription_id?: string } } };
  try { event = JSON.parse(rawBody); }
  catch { return text("Invalid JSON", 400); }

  const subId = event.data?.subscription?.subscription_id;
  if (!subId) return text("No subscription_id in event", 400);

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Load current row (may not exist yet if this is the first event)
  const { data: current } = await supa
    .from("subscriptions")
    .select("*")
    .eq("external_id", subId)
    .maybeSingle();

  const next = applyWebhookEvent(current, event);

  // We MUST preserve org_id from the existing row — Cashfree doesn't echo it.
  if (current?.org_id) next.org_id = current.org_id;
  if (!next.org_id) {
    // Orphan event — log and ack so Cashfree stops retrying.
    console.warn("Cashfree webhook arrived with no matching org row", { subId });
    return text("ok (orphan)", 200);
  }

  const { error: upsertErr } = await supa.from("subscriptions").upsert(next);
  if (upsertErr) {
    console.error("subscriptions upsert failed:", upsertErr);
    return text("upsert failed", 500);
  }

  // Audit log — use the SECURITY DEFINER RPC so it goes through the
  // canonical write path (audit_log_v2 is append-only).
  await supa.rpc("record_audit_v2", {
    p_action: next.status === "active" ? "PAYMENT" :
              next.status === "cancelled" ? "DELETE" : "UPDATE",
    p_resource: "subscription",
    p_resource_id: String(next.org_id),
    p_project_id: null,
    p_before: current ? { status: current.status, plan: current.plan } : null,
    p_after: { status: next.status, plan: next.plan, last_event: next.last_event },
    p_message: `Cashfree event ${next.last_event}: ${current?.status || "(new)"} → ${next.status}`,
  }).catch((e) => console.warn("audit failed:", e));

  return text("ok", 200);
});

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}
