const STORAGE_KEY = "sitetrack_whatsapp_v1";
const META_API_BASE = "https://graph.facebook.com/v18.0";

interface WhatsAppConfig {
  phone_id?: string;
  access_token?: string;
  template_namespace?: string;
  default_template?: string;
  [key: string]: unknown;
}

interface SendOpts {
  to: string;
  message: string;
  attachmentUrl?: string;
}

interface SendResult {
  ok: boolean;
  message_id?: string | null;
  fallback_url?: string;
  error?: string;
  to?: string;
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
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

export function saveWhatsAppConfig(cfg: WhatsAppConfig): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg || {}));
    }
  } catch { /* ignore quota errors */ }
}

export function clearWhatsAppConfig(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

export function isWhatsAppApiEnabled(): boolean {
  const cfg = getWhatsAppConfig();
  return !!(cfg?.phone_id && cfg?.access_token);
}

export async function sendWhatsApp({ to, message, attachmentUrl }: SendOpts): Promise<SendResult> {
  const clean = String(to || "").replace(/[^0-9]/g, "");
  const fallback_url = `https://wa.me/${clean}?text=${encodeURIComponent(message || "")}`;
  if (!clean) return { ok: false, error: "Missing recipient number." };
  if (!isWhatsAppApiEnabled()) return { ok: false, fallback_url };
  const cfg = getWhatsAppConfig();
  try {
    const body: Record<string, unknown> = attachmentUrl
      ? { messaging_product: "whatsapp", to: clean, type: "document", document: { link: attachmentUrl, caption: message } }
      : { messaging_product: "whatsapp", to: clean, type: "text", text: { body: message } };
    const res = await fetch(`${META_API_BASE}/${encodeURIComponent(cfg!.phone_id!)}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg!.access_token}`,
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
    return { ok: false, error: String((e as Error)?.message || e), fallback_url };
  }
}

export async function sendWhatsAppBulk(recipients: string[], message: string, attachmentUrl?: string): Promise<SendResult[]> {
  const out: SendResult[] = [];
  for (const to of recipients) {
    const res = await sendWhatsApp({ to, message, attachmentUrl });
    out.push({ to, ...res });
  }
  return out;
}
