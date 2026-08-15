// supabase/functions/notify-deliver/index.ts
//
// SiteTrack Pro — Notification delivery EF.
//
// The Postgres notifications table records WHAT happened; this EF makes sure
// the user actually HEARS about it. Channels driven by org notification_rules:
//   1. push   — web push API + native Capacitor push
//   2. email  — transactional via Resend (https://resend.com)
//   3. whatsapp — Meta Cloud API (template messages)
//   4. sms    — Twilio fallback (rare; gated)
//
// Triggered by a Postgres trigger on notifications.insert that calls
// net.http_post with X-Internal-Token. Idempotent on `delivered_at`.
//
// Delivery logic:
// - For each notification, find matching notification_rules for the user's org
// - For each rule channel (email/whatsapp), check user prefs + send
// - Push/SMS fall back to user prefs (no rules for these channels yet)
// - WhatsApp uses Meta-approved templates from notification_templates table
// - Email uses subject/body templates from notification_templates table

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
  notification_prefs?: Record<string, { push: boolean; email: boolean; whatsapp: boolean; sms: boolean }>;
}

interface NotifRule {
  id: string;
  trigger: string;
  channel: "in_app" | "email" | "whatsapp";
  enabled: boolean;
}

interface TemplateRow {
  template_name: string | null;
  subject: string | null;
  body: string | null;
}

async function fetchProfile(supa: ReturnType<typeof createClient>, userId: string): Promise<UserProfile | null> {
  const { data } = await supa.from("profiles").select("*").eq("id", userId).maybeSingle();
  const profile = (data as Omit<UserProfile, "email">) ?? null;
  if (!profile) return null;
  // profiles has no email column — pull it from the auth user (service role).
  const { data: authUser } = await supa.auth.admin.getUserById(userId);
  return { ...profile, email: authUser?.user?.email ?? profile.email };
}

async function fetchOrgRules(supa: ReturnType<typeof createClient>, orgId: string | undefined): Promise<NotifRule[]> {
  if (!orgId) return [];
  const { data } = await supa
    .from("notification_rules")
    .select("id, trigger, channel, enabled")
    .eq("org_id", orgId)
    .eq("enabled", true);
  return (data as NotifRule[]) ?? [];
}

async function fetchTemplate(
  supa: ReturnType<typeof createClient>,
  trigger: string,
  channel: "email" | "whatsapp",
  lang: string
): Promise<TemplateRow | null> {
  const { data } = await supa
    .from("notification_templates")
    .select("template_name, subject, body")
    .eq("trigger", trigger)
    .eq("channel", channel)
    .eq("language", lang)
    .maybeSingle();
  return (data as TemplateRow) ?? null;
}

function wantsChannel(profile: UserProfile, kind: string, channel: "push" | "email" | "whatsapp" | "sms"): boolean {
  const prefs = profile?.notification_prefs?.[kind];
  if (!prefs) return channel === "push"; // default: push-only
  return !!prefs[channel];
}

function interpolate(template: string | null, vars: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ from, to, subject, html: htmlBody }),
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

// WhatsApp template send using shared client logic (inline to avoid deps)
async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  language: "en" | "te" | "hi",
  phoneNumberId: string,
  token: string,
  components?: { type: string; parameters: { type: string; text?: string }[] }[]
): Promise<{ ok: boolean; meta_message_id?: string; error?: string }> {
  const META_API_BASE = "https://graph.facebook.com/v18.0";
  const normalize = (raw: string) => raw.replace(/[^0-9]/g, "");
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalize(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: language === "te" ? "te_IN" : language === "hi" ? "hi_IN" : "en_IN" },
      ...(components ? { components } : {}),
    },
  };
  const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return res.ok
    ? { ok: true, meta_message_id: json.messages?.[0]?.id }
    : { ok: false, error: json.error?.message, error_code: json.error?.code };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  // ── Security gate ──
  // notify-deliver is INTERNAL-ONLY — invoked by a Postgres trigger via
  // net.http_post with the X-Internal-Token header. Fail CLOSED.
  const internal = req.headers.get("X-Internal-Token");
  const expected = Deno.env.get("NOTIFY_INTERNAL_TOKEN");
  if (!expected) return json({ error: "notify-internal-token-not-configured" }, 500);
  if (internal !== expected) return json({ error: "unauthorized" }, 401);

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

  // Find matching rules for this org + notification kind
  const rules = await fetchOrgRules(supa, n.org_id);
  const matchingRules = rules.filter(r => r.trigger === n.kind);

  const channels: Record<string, { ok: boolean; error?: string }> = {};

  // For each matching rule, send via its channel
  for (const rule of matchingRules) {
    if (rule.channel === "email" && wantsChannel(profile, n.kind, "email") && profile.email) {
      const template = await fetchTemplate(supa, n.kind, "email", profile.lang ?? "en");
      const vars = {
        title: n.title,
        body: n.body ?? "",
        link: n.link ?? "",
        kind: n.kind,
      };
      const subject = interpolate(template?.subject ?? n.title, vars);
      const htmlBody = interpolate(template?.body ?? `<p>${escapeHtml(n.body || "")}</p>${n.link ? `<p><a href="${escapeHtml(n.link)}">Open in SiteTrack</a></p>` : ""}`, vars);
      channels.email = await sendEmail(profile.email, subject, htmlBody);
    }
    if (rule.channel === "whatsapp" && wantsChannel(profile, n.kind, "whatsapp") && profile.phone) {
      const template = await fetchTemplate(supa, n.kind, "whatsapp", profile.lang ?? "en");
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
      const token = Deno.env.get("WHATSAPP_PERMANENT_TOKEN");
      if (phoneNumberId && token && template?.template_name) {
        channels.whatsapp = await sendWhatsAppTemplate(
          profile.phone,
          template.template_name,
          profile.lang ?? "en",
          phoneNumberId,
          token,
          undefined // components — could add header/body params if needed
        );
      } else {
        channels.whatsapp = { ok: false, error: "WhatsApp not configured or template missing" };
      }
    }
  }

  // Fallback: push (if user wants it and no email/whatsapp rules matched)
  const hasEmailRule = matchingRules.some(r => r.channel === "email");
  const hasWhatsAppRule = matchingRules.some(r => r.channel === "whatsapp");
  if (!hasEmailRule && !hasWhatsAppRule) {
    if (wantsChannel(profile, n.kind, "push") && profile.push_endpoint && profile.push_keys) {
      channels.push = await sendPush(profile.push_endpoint, profile.push_keys, {
        title: n.title, body: n.body || "", link: n.link,
      });
    }
    if (wantsChannel(profile, n.kind, "sms") && profile.phone) {
      channels.sms = await sendSms(profile.phone, `${n.title}\n${n.body || ""}\n${n.link || ""}`);
    }
  }

  const anyOk = Object.values(channels).some(r => r.ok);
  if (anyOk) {
    await supa.from("notifications").update({ delivered_at: new Date().toISOString() }).eq("id", n.id);
  }

  return json({ ok: anyOk, channels });
});