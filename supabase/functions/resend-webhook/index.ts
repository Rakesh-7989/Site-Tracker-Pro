// supabase/functions/resend-webhook/index.ts
//
// SiteTrack Pro — Resend delivery/bounce webhook receiver + inbound forwarder.
//
// Resend (https://resend.com/docs/dashboard/webhooks) POSTs email lifecycle
// events (email.sent / email.delivered / email.delivery_delayed /
// email.complained / email.bounced / email.opened / email.clicked /
// email.received) to this endpoint. Every POST is signed with the Svix scheme;
// we verify the signature with RESEND_WEBHOOK_SECRET before trusting anything,
// then append the event to resend_delivery_events (append-only delivery log).
//
// email.received events are additionally forwarded to the founder inbox
// (EMAIL_FORWARD_TO, fallback constant below) via the Resend API, so mail
// arriving at hello@sitetrackpro.in lands in the founder's Gmail. The webhook
// payload for a received event only carries metadata — the full body is pulled
// from GET https://api.resend.com/emails/receiving/{email_id} and the forward
// is sent FROM the verified sitetrackpro.in domain with reply_to = the
// original sender, so replies reach the original writer.
//
// Deploy (NO verify-jwt — Resend can't sign a Supabase JWT):
//   supabase functions deploy resend-webhook --no-verify-jwt
//   supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
//   supabase secrets set RESEND_API_KEY=re_... EMAIL_FORWARD_TO=<inbox>
//
// In the Resend dashboard, set the webhook URL to:
//   https://<proj>.supabase.co/functions/v1/resend-webhook
// with events including email.received (plus the delivery/bounce family).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseResendEvent,
  normalizeResendEventName,
  verifyResendWebhookSignature,
} from "../_shared/resendWebhook.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Founder inbox — mail sent TO sitetrackpro.in lands here. EMAIL_FORWARD_TO
// (project secret) overrides it when set.
const FORWARD_TO_DEFAULT = "boyapatirakesh7777@gmail.com";
const RESEND_FROM_DEFAULT = "SiteTrack <hello@sitetrackpro.in>";

type ReceiveMeta = {
  subject?: unknown;
  from?: unknown;
  reply_to?: unknown[];
  html?: unknown;
  text?: unknown;
};

/**
 * Pull the received email body from Resend's receiving API and re-send it to
 * EMAIL_FORWARD_TO. Attachments are skipped in v1 (HTML uploads are embedded
 * as data-URI by Resend when html_format defaults to data_uri).
 */
async function forwardReceivedEmail(apiKey: string, emailId: string): Promise<{ forwarded: boolean; reason?: string; id?: string | null }> {
  const to = Deno.env.get("EMAIL_FORWARD_TO") || FORWARD_TO_DEFAULT;

  const metaRes = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!metaRes.ok) {
    const reason = `received-fetch-${metaRes.status}`;
    console.error("resend-webhook: forward received-fetch failed", reason);
    return { forwarded: false, reason };
  }
  const meta = (await metaRes.json()) as ReceiveMeta;

  const subject = typeof meta.subject === "string" && meta.subject
    ? `Fwd: ${meta.subject.slice(0, 200)}`
    : "Fwd: Inbound email (SiteTrack Pro)";
  const originalFrom = typeof meta.from === "string" && meta.from ? meta.from.slice(0, 320) : null;
  // reply_to must look like a single email address — never forward raw
  // attacker-controlled headers (header-injection / relay abuse).
  const replyCandidate = Array.isArray(meta.reply_to) && meta.reply_to[0]
    ? String(meta.reply_to[0]).slice(0, 320)
    : originalFrom;
  const replyTo = replyCandidate && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyCandidate)
    ? replyCandidate
    : null;
  const text = typeof meta.text === "string" && meta.text
    ? meta.text.slice(0, 20000)
    : originalFrom
      ? `Received email (no text body); original from ${originalFrom}.`
      : "Received email (no text body).";

  const body: Record<string, unknown> = {
    from: Deno.env.get("RESEND_FROM_EMAIL") || RESEND_FROM_DEFAULT,
    to: [to],
    subject,
    text,
  };
  // NOTE (SEC-P2-7): intentionally TEXT-ONLY. Forwarding meta.html would
  // re-send attacker-controlled markup from our verified domain — a
  // credential-harvesting relay. The founder reads the text body; the full
  // original stays in Resend receiving.
  if (replyTo) body.reply_to = [replyTo];

  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!sendRes.ok) {
    const reason = `send-${sendRes.status}`;
    console.error("resend-webhook: forward send failed", reason);
    return { forwarded: false, reason };
  }
  const sent = (await sendRes.json()) as { id?: string };
  return { forwarded: true, id: sent.id ?? null };
}

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

  // email.received payloads nest the real message under data.data and carry the
  // email id under data.email_id — enrich the parsed event so the delivery log
  // records the actual recipient / subject / id for received emails too.
  const data = (evt.raw.data ?? {}) as Record<string, unknown>;
  const nested = (data.data ?? {}) as Record<string, unknown>;
  if (evt.event === "email.received") {
    evt.messageId = evt.messageId ?? (typeof data.email_id === "string" ? data.email_id : undefined);
    evt.toEmail = evt.toEmail ?? (Array.isArray(nested.to) ? String(nested.to[0]) : undefined);
    evt.subject = evt.subject ?? (typeof nested.subject === "string" ? nested.subject : undefined);
  }

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

  let forwarded: { forwarded: boolean; reason?: string; id?: string | null } | null = null;
  if (evt.event === "email.received") {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const emailId = evt.messageId;
    if (!apiKey) {
      forwarded = { forwarded: false, reason: "no-resend-api-key" };
    } else if (!emailId) {
      forwarded = { forwarded: false, reason: "no-email-id" };
    } else {
      forwarded = await forwardReceivedEmail(apiKey, emailId);
    }
  }

  return json({ ok: true, event: normalizeResendEventName(evt.event), forwarded });
});