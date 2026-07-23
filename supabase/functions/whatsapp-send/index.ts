// supabase/functions/whatsapp-send/index.ts
//
// SiteTrack Pro — WhatsApp send Edge Function.
//
// Why an EF instead of a browser call:
//   - Meta Cloud API requires a Permanent Token (System User). Putting that
//     in the browser bundle leaks it to every visitor.
//   - The EF holds the token server-side; the browser just sends a typed
//     payload `{ kind, to, project_id, … }` over an authenticated channel.
//
// Two send modes:
//   1. "template"  — for outside-24h-window messages. Must be a Meta-approved
//                    template (we ship `daily_progress_te`, `daily_progress_en`,
//                    `daily_progress_hi`, `payment_received_*`).
//   2. "text"      — free-form, only valid inside 24h after the recipient
//                    last messaged us (Meta's "session" window).
//
// All sends:
//   - Log into `whatsapp_log` table for auditability.
//   - Are rate-limited per-org (10/min default, configurable).
//   - Mirror responses 1:1 from Meta (we don't try to be smart on errors —
//     the UI shows the Meta error code which is well-documented).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { requirePlanFeature } from "../_shared/planCheck.ts";
import { corsResponse } from "../_shared/cors.ts";

const META_API_BASE = "https://graph.facebook.com/v18.0";

// ── Types ───────────────────────────────────────────────────────────────

interface SendRequestText {
  kind: "text";
  to: string;                // E.164, e.g. "+919876543210"
  body: string;              // <= 4096 chars
  project_id?: string;
  org_id?: string;
  context?: { message_id: string };   // reply-to
}

interface SendRequestTemplate {
  kind: "template";
  to: string;
  template_name: string;     // e.g. "daily_progress_te"
  language: "te" | "hi" | "en";
  components?: TemplateComponent[];
  project_id?: string;
  org_id?: string;
}

interface TemplateComponent {
  type: "header" | "body" | "footer" | "button";
  parameters?: { type: "text" | "currency" | "date_time"; text?: string }[];
}

type SendRequest = SendRequestText | SendRequestTemplate;

interface MetaResponse {
  messaging_product?: "whatsapp";
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
  error?: { message: string; type: string; code: number; error_data?: unknown };
}

// ── Helpers ─────────────────────────────────────────────────────────────

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function normalizeNumber(raw: string): string {
  // Meta wants the number WITHOUT the leading "+", just digits.
  return raw.replace(/[^0-9]/g, "");
}

function buildPayload(req: SendRequest): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(req.to),
  };
  if (req.kind === "text") {
    return {
      ...base,
      type: "text",
      text: { body: req.body, preview_url: false },
      ...(req.context ? { context: req.context } : {}),
    };
  }
  return {
    ...base,
    type: "template",
    template: {
      name: req.template_name,
      language: { code: req.language === "te" ? "te_IN" : req.language === "hi" ? "hi_IN" : "en_IN" },
      ...(req.components ? { components: req.components } : {}),
    },
  };
}

async function rateLimitCheck(
  supa: SupabaseClient, orgId: string | undefined,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!orgId) return { ok: true };
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { count, error } = await supa
    .from("whatsapp_log")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", since);
  if (error) return { ok: true };   // fail open — don't block on log errors
  const limit = parseInt(Deno.env.get("WHATSAPP_PER_ORG_RPM") || "10", 10);
  if ((count ?? 0) >= limit) {
    return { ok: false, reason: `org-rate-limit (${count}/${limit} per minute)` };
  }
  return { ok: true };
}

// ── HTTP entry ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  let body: SendRequest;
  try { body = (await req.json()) as SendRequest; }
  catch { return json({ error: "invalid-json" }, 400); }

  // ── Security gate (Phase 5 hardening) ──
  // Two trusted callers:
  //   1. Service-to-service (e.g. cashfree-webhook → whatsapp-send) presents
  //      a matching X-Internal-Token. We trust it without a user JWT.
  //   2. The SPA presents a user JWT. Previously the EF only checked the
  //      Bearer header EXISTED (never verified it) — any string passed.
  //      Now we verify the JWT + gate to message-sending roles, and verify
  //      project membership when project_id is present.
  const internal = req.headers.get("X-Internal-Token");
  const expectedInternal = Deno.env.get("WHATSAPP_INTERNAL_TOKEN");
  const isService = Boolean(expectedInternal && internal === expectedInternal);
  if (!isService) {
    const auth = await authenticate(req, {
      requireRole: ["pm", "project_admin", "site_engineer", "site_supervisor", "promoter", "orgadmin", "superadmin", "admin"],
      ...(body.project_id ? { requireProjectId: body.project_id } : {}),
    });
    if (!auth.ok) return auth.response;
  }

  // Plan gate: programmatic WhatsApp send is a Business+ feature.
  const planChk = await requirePlanFeature(body.org_id, "whatsapp_send");
  if (!planChk.allow) return json({ error: "plan-upgrade-required", feature: "whatsapp_send", required: "business" }, 402);

  if (!body?.to) return json({ error: "to-required" }, 400);
  if (body.kind === "text" && (!body.body || body.body.length > 4096)) {
    return json({ error: "body-required-or-too-long" }, 400);
  }
  if (body.kind === "template" && (!body.template_name || !body.language)) {
    return json({ error: "template_name-and-language-required" }, 400);
  }

  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const token = Deno.env.get("WHATSAPP_PERMANENT_TOKEN");
  if (!phoneNumberId || !token) {
    return json({ error: "whatsapp-not-configured", hint: "set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_PERMANENT_TOKEN" }, 500);
  }

  // Supabase admin for logging
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supa = createClient(supaUrl, supaKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Rate limit per org
  const rl = await rateLimitCheck(supa, body.org_id);
  if (!rl.ok) {
    await supa.from("whatsapp_log").insert({
      org_id: body.org_id, project_id: body.project_id,
      to_phone: body.to, kind: body.kind, status: "rate-limited", failure_reason: rl.reason,
    });
    return json({ error: "rate-limited", reason: rl.reason }, 429);
  }

  // Call Meta
  const payload = buildPayload(body);
  const metaRes = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const metaJson = (await metaRes.json()) as MetaResponse;
  const messageId = metaJson.messages?.[0]?.id;
  const waId = metaJson.contacts?.[0]?.wa_id;

  await supa.from("whatsapp_log").insert({
    org_id: body.org_id,
    project_id: body.project_id,
    to_phone: body.to,
    wa_id: waId,
    kind: body.kind,
    template_name: body.kind === "template" ? body.template_name : null,
    language: body.kind === "template" ? body.language : null,
    body: body.kind === "text" ? body.body : null,
    meta_message_id: messageId,
    meta_status_code: metaRes.status,
    status: metaRes.ok ? "sent" : "failed",
    failure_reason: metaJson.error?.message,
    failure_code: metaJson.error?.code,
    raw_response: metaJson as unknown as Record<string, unknown>,
  });

  if (!metaRes.ok) {
    return json({
      error: "meta-error",
      code: metaJson.error?.code,
      message: metaJson.error?.message,
    }, metaRes.status);
  }

  return json({
    ok: true,
    message_id: messageId,
    wa_id: waId,
    log_id: undefined,   // filled in by trigger if we add returning() later
  });
});
