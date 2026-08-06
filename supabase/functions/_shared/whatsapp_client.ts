// SiteTrack Pro — shared WhatsApp Cloud API client (Deno Edge Functions).
//
// Single source of truth for calling the Meta Cloud API `messages` endpoint.
// Extracted from the original whatsapp-send EF so that whatsapp_dpr_send and
// promoter_digest_cron reuse the SAME real send path instead of duplicating
// the HTTP payload/build/response handling.
//
// Two send kinds (matching the Meta API):
//   text      — free-form, only valid inside the 24h session window.
//   template  — Meta-approved templates (daily_progress_*, payment_received_*).
//
// This module is intentionally dependency-free (only Deno globals) so any EF
// can import it without pulling in supabase-js or other runtime deps.

// deno-lint-ignore-file no-explicit-any

const META_API_BASE = "https://graph.facebook.com/v18.0";

/** Meta wants the number WITHOUT the leading "+", just digits. */
export function normalizeNumber(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

export interface WhatsAppTextMessage {
  kind: "text";
  to: string;             // E.164, e.g. "+919876543210"
  body: string;           // <= 4096 chars
  context?: { message_id: string };   // reply-to
}

export interface WhatsAppTemplateMessage {
  kind: "template";
  to: string;
  template_name: string;
  language: "te" | "hi" | "en";
  components?: TemplateComponent[];
}

export interface TemplateComponent {
  type: "header" | "body" | "footer" | "button";
  parameters?: { type: "text" | "currency" | "date_time"; text?: string }[];
}

export type WhatsAppMessage = WhatsAppTextMessage | WhatsAppTemplateMessage;

export interface WhatsAppSendResult {
  ok: boolean;
  meta_message_id?: string;
  wa_id?: string;
  status_code?: number;
  error?: string;
  error_code?: number;
  raw?: Record<string, unknown>;
}

function buildPayload(msg: WhatsAppMessage): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(msg.to),
  };
  if (msg.kind === "text") {
    return {
      ...base,
      type: "text",
      text: { body: msg.body, preview_url: false },
      ...(msg.context ? { context: msg.context } : {}),
    };
  }
  return {
    ...base,
    type: "template",
    template: {
      name: msg.template_name,
      language: { code: msg.language === "te" ? "te_IN" : msg.language === "hi" ? "hi_IN" : "en_IN" },
      ...(msg.components ? { components: msg.components } : {}),
    },
  };
}

/**
 * Send one WhatsApp message via the Meta Cloud API.
 *
 * @param opts.phoneNumberId  Meta phone-number id (env WHATSAPP_PHONE_NUMBER_ID)
 * @param opts.token          Permanent token (env WHATSAPP_PERMANENT_TOKEN)
 * @param opts.message        The message to send (text or template)
 */
export async function sendWhatsAppMessage(opts: {
  phoneNumberId: string;
  token: string;
  message: WhatsAppMessage;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId, token, message } = opts;
  try {
    const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(buildPayload(message)),
    });
    const json = (await res.json()) as {
      messages?: { id: string }[];
      contacts?: { wa_id: string }[];
      error?: { message: string; code: number; error_data?: unknown };
    };
    return {
      ok: res.ok,
      meta_message_id: json.messages?.[0]?.id,
      wa_id: json.contacts?.[0]?.wa_id,
      status_code: res.status,
      error: json.error?.message,
      error_code: json.error?.code,
      raw: json as unknown as Record<string, unknown>,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
