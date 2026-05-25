// SiteTrack Pro — WhatsApp delivery (Business API + wa.me fallback).
//
// Today: every "Share via WhatsApp" button opens `wa.me/<number>?text=<msg>`
// which requires manual click. That breaks the demo's "daily DPR auto-pushed
// to client" promise. This lib adds:
//
//   sendWhatsApp({ to, message, template?, attachmentUrl? })
//
// behaviour:
//   - If WhatsApp Business API creds are configured (env or settings localStorage),
//     POST to the Meta Cloud API endpoint, return { ok: true, message_id }.
//   - Otherwise return { ok: false, fallback_url: "https://wa.me/..." } so the
//     UI can offer the click-to-send fallback.
//
// Cred shape (localStorage key: `sitetrack_whatsapp_v1`):
//   { phone_id, access_token, template_namespace?, default_template? }
//
// Demo mode: this module is deliberately mock-safe — without creds it ALWAYS
// returns fallback_url, never throws.

const STORAGE_KEY = "sitetrack_whatsapp_v1";
const META_API_BASE = "https://graph.facebook.com/v18.0";

/** Read creds from localStorage (browser) or env vars (test/server). */
export function getWhatsAppConfig() {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch { /* ignore */ }
  if (typeof process !== "undefined" && process?.env) {
    const phone = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;
    if (phone && token) return { phone_id: phone, access_token: token };
  }
  return null;
}

/** Save creds (called from Admin Settings UI). */
export function saveWhatsAppConfig(cfg) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg || {}));
    }
  } catch { /* ignore quota errors */ }
}

/** Clear creds. */
export function clearWhatsAppConfig() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

/** Reports whether the Business API path is available right now. */
export function isWhatsAppApiEnabled() {
  const cfg = getWhatsAppConfig();
  return !!(cfg?.phone_id && cfg?.access_token);
}

/**
 * Send a message via WhatsApp Business API. Returns { ok, message_id?, fallback_url? }.
 * Caller is expected to handle the fallback path if `ok === false`.
 */
export async function sendWhatsApp({ to, message, attachmentUrl }) {
  const clean = String(to || "").replace(/[^0-9]/g, "");
  const fallback_url = `https://wa.me/${clean}?text=${encodeURIComponent(message || "")}`;
  if (!clean) return { ok: false, error: "Missing recipient number." };
  if (!isWhatsAppApiEnabled()) return { ok: false, fallback_url };
  const cfg = getWhatsAppConfig();
  try {
    const body = attachmentUrl
      ? { messaging_product: "whatsapp", to: clean, type: "document", document: { link: attachmentUrl, caption: message } }
      : { messaging_product: "whatsapp", to: clean, type: "text", text: { body: message } };
    const res = await fetch(`${META_API_BASE}/${encodeURIComponent(cfg.phone_id)}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: txt.slice(0, 200), fallback_url };
    }
    const data = await res.json();
    return { ok: true, message_id: data?.messages?.[0]?.id || null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), fallback_url };
  }
}

/** Convenience — bulk send to many recipients. */
export async function sendWhatsAppBulk(recipients, message, attachmentUrl) {
  const out = [];
  for (const to of recipients) {
    const res = await sendWhatsApp({ to, message, attachmentUrl });
    out.push({ to, ...res });
  }
  return out;
}
