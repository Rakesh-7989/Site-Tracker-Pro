// supabase/functions/notify-deliver/index.ts
//
// SiteTrack Pro — Notification delivery EF.
//
// The Postgres notifications table records WHAT happened; this EF makes sure
// the user actually HEARS about it. Three channels:
//   1. push   — web push API + native Capacitor push
//   2. email  — transactional via Resend (https://resend.com) — chosen for
//               founder-friendly pricing + India deliverability
//   3. sms    — Twilio fallback for users without smartphones (rare; gated)
//
// Triggered by a Postgres trigger on notifications.insert that calls
// supabase.functions.invoke('notify-deliver', { id }). Idempotent on
// `delivered_at` — re-runs just no-op.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

interface Notification {
  id: string;
  user_id: string;
  project_id?: string;
  org_id?: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  read_at?: string;
  delivered_at?: string;
}

interface UserProfile {
  id: string;
  email?: string;
  phone?: string;
  push_endpoint?: string;
  push_keys?: { p256dh: string; auth: string };
  lang?: "en" | "te" | "hi";
  notification_prefs?: Record<string, { push: boolean; email: boolean; sms: boolean }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function fetchProfile(supa: ReturnType<typeof createClient>, userId: string): Promise<UserProfile | null> {
  const { data } = await supa.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as UserProfile) ?? null;
}

function wantsChannel(profile: UserProfile, kind: string, channel: "push" | "email" | "sms"): boolean {
  const prefs = profile?.notification_prefs?.[kind];
  if (!prefs) return channel === "push";   // default: push-only
  return !!prefs[channel];
}

async function sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ from, to, subject, html: body }),
  });
  const j = await res.json();
  return res.ok ? { ok: true, id: j.id } : { ok: false, error: j.message };
}

async function sendSms(to: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !tok || !from) return { ok: false, error: "Twilio creds missing" };
  const auth = btoa(`${sid}:${tok}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const j = await res.json();
  return res.ok ? { ok: true, sid: j.sid } : { ok: false, error: j.message };
}

async function sendPush(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: { title: string; body: string; link?: string },
): Promise<{ ok: boolean; error?: string }> {
  // We don't implement Web Push protocol from scratch in Deno — that requires
  // VAPID signing + ECDH key derivation. Instead, defer to a Vercel/edge
  // worker the operator stands up. The EF posts the payload to PUSH_RELAY_URL.
  const relay = Deno.env.get("PUSH_RELAY_URL");
  const relayToken = Deno.env.get("PUSH_RELAY_TOKEN");
  if (!relay) return { ok: false, error: "PUSH_RELAY_URL not set" };
  const res = await fetch(relay, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(relayToken ? { "Authorization": `Bearer ${relayToken}` } : {}) },
    body: JSON.stringify({ endpoint, keys, payload }),
  });
  return res.ok ? { ok: true } : { ok: false, error: `relay-${res.status}` };
}

// ── HTTP entry ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const internal = req.headers.get("X-Internal-Token");
  const expected = Deno.env.get("NOTIFY_INTERNAL_TOKEN");
  if (expected && internal !== expected) return json({ error: "unauthorized" }, 401);

  let body: { id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid-json" }, 400); }
  if (!body.id) return json({ error: "id-required" }, 400);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: notif, error: ne } = await supa
    .from("notifications").select("*").eq("id", body.id).maybeSingle();
  if (ne || !notif) return json({ error: "not-found" }, 404);
  const n = notif as Notification;

  if (n.delivered_at) return json({ ok: true, already_delivered: true });

  const profile = await fetchProfile(supa, n.user_id);
  if (!profile) return json({ error: "no-profile" }, 404);

  const channels: Record<string, { ok: boolean; error?: string }> = {};

  if (wantsChannel(profile, n.kind, "push") && profile.push_endpoint && profile.push_keys) {
    channels.push = await sendPush(profile.push_endpoint, profile.push_keys, {
      title: n.title, body: n.body || "", link: n.link,
    });
  }
  if (wantsChannel(profile, n.kind, "email") && profile.email) {
    channels.email = await sendEmail(profile.email, n.title, `<p>${escapeHtml(n.body || "")}</p>${n.link ? `<p><a href="${escapeHtml(n.link)}">Open in SiteTrack</a></p>` : ""}`);
  }
  if (wantsChannel(profile, n.kind, "sms") && profile.phone) {
    channels.sms = await sendSms(profile.phone, `${n.title}\n${n.body || ""}\n${n.link || ""}`);
  }

  const anyOk = Object.values(channels).some(r => r.ok);
  if (anyOk) {
    await supa.from("notifications").update({ delivered_at: new Date().toISOString() }).eq("id", n.id);
  }

  return json({ ok: anyOk, channels });
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
