// supabase/functions/resend-webhook/index.ts
//
// SiteTrack Pro — Resend delivery/bounce webhook receiver.
//
// Resend (https://resend.com/docs/dashboard/webhooks) POSTs email lifecycle
// events (email.sent / email.delivered / email.delivery_delayed /
// email.complained / email.bounced / email.opened / email.clicked) to this
// endpoint. Every POST is signed with the Svix scheme; we verify the signature
// with RESEND_WEBHOOK_SECRET before trusting anything, then append the event
// to resend_delivery_events (append-only delivery log).
//
// Deploy (NO verify-jwt — Resend can't sign a Supabase JWT):
//   supabase functions deploy resend-webhook --no-verify-jwt
//   supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
//
// In the Resend dashboard, set the webhook URL to:
//   https://<proj>.supabase.co/functions/v1/resend-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseResendEvent,
  normalizeResendEventName,
  verifyResendWebhookSignature,
} from "../_shared/resendWebhook.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return json({ error: "resend-webhook-secret-not-configured" }, 500);

  const rawBody = await req.text();
  if (!rawBody) return json({ error: "empty-body" }, 400);

  const headers = {
    msgId: req.headers.get("svix-id") || "",
    timestamp: req.headers.get("svix-timestamp") || "",
    signature: req.headers.get("svix-signature") || "",
  };
  if (!headers.msgId || !headers.timestamp || !headers.signature) {
    return json({ error: "missing-svix-headers" }, 401);
  }

  const valid = await verifyResendWebhookSignature(headers, rawBody, secret);
  if (!valid) return json({ error: "invalid-signature" }, 401);

  const evt = parseResendEvent(rawBody);
  if (!evt) return json({ error: "invalid-event" }, 400);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await supa.from("resend_delivery_events").insert({
    event: normalizeResendEventName(evt.event),
    raw_event: evt.event,
    message_id: evt.messageId ?? null,
    to_email: evt.toEmail ?? null,
    subject: evt.subject ?? null,
    tags: evt.tags ?? [],
    payload: evt.raw,
  });

  if (error) {
    console.error("resend-webhook: insert failed", error.message);
    return json({ error: "log-failed" }, 500);
  }

  return json({ ok: true, event: normalizeResendEventName(evt.event) });
});