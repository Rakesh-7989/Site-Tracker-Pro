// SiteTrack Pro — Sprint 2 (Session 30.3): WhatsApp DPR send Edge Function.
//
// Production hardening of the existing whatsapp-send EF specifically for
// the Daily Progress Report flow. Adds:
//   - Idempotency via client_token (UPSERT on dpr_messages.client_token)
//   - 3-attempt exponential backoff retry (1s, 4s, 16s) via _shared/retry
//   - Per-attempt audit log to dpr_delivery_log
//   - Builder-promoter routing (different from a generic recipient)
//   - Telemetry: total_ms, attempts, provider response
//
// Status: real Meta Cloud API send wired via _shared/whatsapp_client.ts
// (same client whatsapp-send uses). Sends go live once the founder sets
// WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_PERMANENT_TOKEN for the pilot orgs;
// SITETRACK_DRY_RUN=true keeps the EF usable without Meta wiring.
//
// See docs/SPRINT_2_ARCHITECTURE.md for the contract.

// deno-lint-ignore-file no-explicit-any
import { retry } from "../_shared/retry.ts";
import { getBudgetMode } from "../_shared/budget.ts";
import { authenticate } from "../_shared/auth.ts";
import { requirePlanFeature } from "../_shared/planCheck.ts";
import { sendWhatsAppMessage } from "../_shared/whatsapp_client.ts";

/**
 * Meta Cloud API gives 1k free service conversations per WABA per UTC
 * month. The Supabase function `whatsapp_quota_increment(waba_id)`
 * atomically bumps + returns the current month's count so we can
 * pass / soft-warn / hard-block in a single round-trip.
 *
 * BUDGET_MODE=zero-spend  → hard-block at hard_limit (1000 default)
 * BUDGET_MODE=paid        → log warning past soft_limit but proceed
 * WHATSAPP_OVERRIDE_PAID=1 → bypass guard even in zero-spend
 */
interface QuotaRow {
  waba_id: string;
  utc_month: string;
  sent_count: number;
  soft_limit: number;
  hard_limit: number;
  last_increment: string;
}

interface QuotaDecision {
  allowed: boolean;
  reason?: string;
  quota?: QuotaRow;
  warning?: string;
}

async function incrementQuota(
  supabaseUrl: string,
  serviceKey: string,
  wabaId: string,
  env: Record<string, string>,
): Promise<QuotaDecision> {
  // Atomic bump via RPC defined in migration 57.
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/whatsapp_quota_increment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ p_waba_id: wabaId }),
  });
  if (!rpcRes.ok) {
    // If the RPC doesn't exist yet (migration 57 not applied), don't fail
    // — log a warning + proceed (fail-open during initial rollout).
    return {
      allowed: true,
      warning: `quota RPC unavailable (status ${rpcRes.status}); proceeding without meter`,
    };
  }
  const quota = (await rpcRes.json()) as QuotaRow;
  const override = env.WHATSAPP_OVERRIDE_PAID === "1";
  const mode = getBudgetMode(env);

  if (override) {
    return { allowed: true, quota, warning: "WHATSAPP_OVERRIDE_PAID=1 — bypassing budget guard" };
  }
  if (quota.sent_count > quota.hard_limit && mode === "zero-spend") {
    return {
      allowed: false,
      reason: `whatsapp quota exceeded: ${quota.sent_count}/${quota.hard_limit} this month (${quota.utc_month}). Set WHATSAPP_OVERRIDE_PAID=1 or BUDGET_MODE=paid to send.`,
      quota,
    };
  }
  if (quota.sent_count > quota.soft_limit) {
    return {
      allowed: true,
      quota,
      warning: `whatsapp quota at ${quota.sent_count}/${quota.hard_limit} (soft limit ${quota.soft_limit} crossed)`,
    };
  }
  return { allowed: true, quota };
}

interface DprSendRequest {
  client_token: string;        // UUID, the idempotency key
  org_id: string;
  project_id?: string;
  supervisor_user_id?: string;
  promoter_phone_e164: string;
  language: "te" | "hi" | "en";
  voice_audio_url?: string;
  voice_audio_sha256?: string;
  transcript_text?: string;
  transcript_confidence?: number;
  transcript_provider?: string;
  photo_url?: string;
  photo_taken_at?: string;
  photo_lat?: number;
  photo_lon?: number;
  photo_accuracy_metres?: number;
  buildnow_anchor_url?: string;
  buildnow_anchor_hash?: string;
  /** Spatial hierarchy node ref (P2.4). Null = not stamped. */
  location_id?: string;
}

interface DprSendResponse {
  ok: boolean;
  dpr_message_id?: string;
  status?: "queued" | "sending" | "sent" | "delivered" | "failed";
  meta_message_id?: string;
  cached?: boolean;
  attempts?: number;
  total_ms?: number;
  error?: string;
}

const REQUIRED_FIELDS: (keyof DprSendRequest)[] = [
  "client_token",
  "org_id",
  "promoter_phone_e164",
  "language",
];

const ALLOWED_LANGS = new Set(["te", "hi", "en"]);

function validate(req: DprSendRequest): string | null {
  for (const k of REQUIRED_FIELDS) {
    if (!req[k]) return `missing required field: ${k}`;
  }
  if (!ALLOWED_LANGS.has(req.language)) return `unsupported language: ${req.language}`;
  if (!/^\+\d{10,15}$/.test(String(req.promoter_phone_e164))) {
    return "promoter_phone_e164 must be +XXXXXXXXXXX (E.164)";
  }
  if (typeof req.transcript_confidence === "number") {
    if (req.transcript_confidence < 0 || req.transcript_confidence > 1) {
      return "transcript_confidence must be in [0, 1]";
    }
  }
  return null;
}

/**
 * Real Meta Cloud API send. Wired in Sprint 2 mid-cycle via the shared
 * whatsapp_client.ts (same client whatsapp-send uses).
 *
 * - SITETRACK_DRY_RUN=true → returns a fake wamid without hitting Meta
 *   (used for demo / acceptance testing before the founder sets the token).
 * - Otherwise requires WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_PERMANENT_TOKEN.
 *   The DPR is rendered into a short text body (language-aware) and sent as
 *   a text message to the promoter.
 */
async function sendViaMetaCloudApi(
  payload: DprSendRequest,
  env: Record<string, string>,
): Promise<{ ok: boolean; meta_message_id?: string; error?: string }> {
  if (env.SITETRACK_DRY_RUN === "true") {
    return {
      ok: true,
      meta_message_id: `wamid.DRY_RUN_${Date.now()}`,
    };
  }
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_PERMANENT_TOKEN;
  if (!phoneNumberId || !token) {
    return {
      ok: false,
      error:
        "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_PERMANENT_TOKEN missing. Set SITETRACK_DRY_RUN=true to test the EF without Meta wiring.",
    };
  }

  // Compose the short WhatsApp body the promoter sees — mirrors the tone of
  // the browser preview (digestPreview.ts) so the two never diverge.
  const lines: string[] = [];
  lines.push(payload.language === "en" ? "Daily Progress Report" : "Site update");
  lines.push(payload.transcript_text ?? "(audio note attached)");
  if (payload.photo_url) lines.push(`Photo: ${payload.photo_url}`);

  const res = await sendWhatsAppMessage({
    phoneNumberId,
    token,
    message: {
      kind: "text",
      to: payload.promoter_phone_e164,
      body: lines.join("\n").slice(0, 4096),
    },
  });

  if (!res.ok) {
    return { ok: false, error: `meta error ${res.status_code ?? "?"}: ${res.error}` };
  }
  return { ok: true, meta_message_id: res.meta_message_id };
}

Deno.serve(async (httpReq: Request) => {
  if (httpReq.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  let payload: DprSendRequest;
  try {
    payload = await httpReq.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid JSON" } satisfies DprSendResponse,
      { status: 400 },
    );
  }
  const invalid = validate(payload);
  if (invalid) {
    return Response.json(
      { ok: false, error: invalid } satisfies DprSendResponse,
      { status: 400 },
    );
  }

  // ── Security gate (Phase 5 hardening) ──
  // A DPR send must come from someone authorised to report on the project.
  // Gate to site_supervisor / site_engineer / pm / project_admin (the
  // roles that submit DPRs) plus org admins. When project_id is present we
  // verify project membership too. Previously this EF had NO caller check —
  // cross-org message spoofing was possible.
  const auth = await authenticate(httpReq, {
    requireRole: ["site_supervisor", "site_engineer", "pm", "project_admin", "promoter", "orgadmin", "superadmin", "admin"],
    ...(payload.project_id ? { requireProjectId: payload.project_id } : {}),
  });
  if (!auth.ok) return auth.response;

  // Plan gate: automated WhatsApp DPR send is a Business+ feature.
  const planChk = await requirePlanFeature(payload.org_id, "dpr_auto");
  if (!planChk.allow) {
    return Response.json(
      { ok: false, error: "plan-upgrade-required: automated WhatsApp DPR needs the Business plan" } satisfies DprSendResponse,
      { status: 402 },
    );
  }

  const env = Deno.env.toObject();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing" } satisfies DprSendResponse,
      { status: 500 },
    );
  }

  // ── Idempotency check (UPSERT by client_token) ───────────────────────────
  // Use the REST endpoint instead of a full client to keep cold-start small.
  const upsertUrl = `${supabaseUrl}/rest/v1/dpr_messages?on_conflict=org_id,client_token`;
  const messageRow = {
    org_id: payload.org_id,
    project_id: payload.project_id ?? null,
    client_token: payload.client_token,
    supervisor_user_id: payload.supervisor_user_id ?? null,
    promoter_phone_e164: payload.promoter_phone_e164,
    language: payload.language,
    voice_audio_url: payload.voice_audio_url ?? null,
    voice_audio_sha256: payload.voice_audio_sha256 ?? null,
    transcript_text: payload.transcript_text ?? null,
    transcript_confidence: payload.transcript_confidence ?? null,
    transcript_provider: payload.transcript_provider ?? null,
    photo_url: payload.photo_url ?? null,
    photo_taken_at: payload.photo_taken_at ?? null,
    photo_lat: payload.photo_lat ?? null,
    photo_lon: payload.photo_lon ?? null,
    photo_accuracy_metres: payload.photo_accuracy_metres ?? null,
    buildnow_anchor_url: payload.buildnow_anchor_url ?? null,
    buildnow_anchor_hash: payload.buildnow_anchor_hash ?? null,
    location_id: payload.location_id ?? null,
    status: "sending",
  };

  const upsertRes = await fetch(upsertUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Prefer": "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(messageRow),
  });
  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    return Response.json(
      { ok: false, error: `upsert failed: ${upsertRes.status} ${text.slice(0, 200)}` } satisfies DprSendResponse,
      { status: 500 },
    );
  }
  const rows = await upsertRes.json();
  const message = Array.isArray(rows) ? rows[0] : rows;
  const dprMessageId = message?.id as string | undefined;

  // If the existing row is already terminal, return idempotently.
  if (message?.status === "sent" || message?.status === "delivered" || message?.status === "read") {
    return Response.json({
      ok: true,
      dpr_message_id: dprMessageId,
      status: message.status,
      meta_message_id: message.meta_message_id ?? undefined,
      cached: true,
    } satisfies DprSendResponse);
  }

  // ── Budget guard: enforce Meta's 1k free-tier cap unless overridden ──────
  // Only run the meter when the EF is about to make a REAL (non-dry-run)
  // call — dry-run rows don't bill, so they shouldn't burn quota.
  if (env.SITETRACK_DRY_RUN !== "true" && env.WHATSAPP_PHONE_NUMBER_ID) {
    const quotaDecision = await incrementQuota(
      supabaseUrl,
      serviceKey,
      env.WHATSAPP_PHONE_NUMBER_ID,   // proxy for WABA id
      env,
    );
    if (quotaDecision.warning) console.warn(`[whatsapp_dpr_send] ${quotaDecision.warning}`);
    if (!quotaDecision.allowed) {
      // Mark the message as 'failed' with budget-blocked reason so the
      // dashboard can surface this distinctly from network failures.
      if (dprMessageId) {
        await fetch(`${supabaseUrl}/rest/v1/dpr_messages?id=eq.${dprMessageId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": serviceKey,
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            status: "failed",
            failure_reason: `budget-blocked: ${quotaDecision.reason}`,
          }),
        });
      }
      return Response.json(
        {
          ok: false,
          dpr_message_id: dprMessageId,
          status: "failed",
          error: quotaDecision.reason,
        } satisfies DprSendResponse,
        { status: 402 },   // 402 Payment Required — fitting for budget block
      );
    }
  }

  // ── Send via Meta Cloud API with retry ───────────────────────────────────
  const attemptResults: { attempt: number; outcome: "success" | "retry" | "failed"; durationMs: number; error?: string }[] = [];
  const t0 = Date.now();
  const final = await retry(
    async (attempt) => {
      const ta = Date.now();
      const res = await sendViaMetaCloudApi(payload, env);
      const durationMs = Date.now() - ta;
      attemptResults.push({
        attempt,
        outcome: res.ok ? "success" : "retry",
        durationMs,
        error: res.ok ? undefined : res.error,
      });
      if (!res.ok) throw new Error(res.error ?? "send failed");
      return res;
    },
    {
      maxAttempts: 3,
      baseMs: 1000,
      shouldRetry: (err) => {
        const msg = String((err as Error)?.message ?? err);
        // Don't retry validation / auth errors — they won't go away on retry.
        if (/missing|not implemented|unauthorized|forbidden/i.test(msg)) return false;
        return true;
      },
    },
  );

  // Mark the last attempt as 'failed' if final result failed.
  if (!final.ok && attemptResults.length > 0) {
    attemptResults[attemptResults.length - 1].outcome = "failed";
  }

  // ── Write delivery log (one row per attempt) ─────────────────────────────
  if (dprMessageId) {
    const logRows = attemptResults.map((a) => ({
      dpr_message_id: dprMessageId,
      attempt_number: a.attempt,
      outcome: a.outcome,
      duration_ms: a.durationMs,
      error_detail: a.error ?? null,
    }));
    if (logRows.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/dpr_delivery_log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(logRows),
      });
    }
  }

  // ── Update message status ────────────────────────────────────────────────
  if (dprMessageId) {
    const patch = final.ok
      ? {
          status: "sent",
          meta_message_id: final.result?.meta_message_id ?? null,
          failure_reason: null,
        }
      : {
          status: "failed",
          failure_reason: String((final.error as Error)?.message ?? final.error ?? "unknown"),
        };
    await fetch(`${supabaseUrl}/rest/v1/dpr_messages?id=eq.${dprMessageId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(patch),
    });
  }

  return Response.json(
    {
      ok: final.ok,
      dpr_message_id: dprMessageId,
      status: final.ok ? "sent" : "failed",
      meta_message_id: final.result?.meta_message_id,
      attempts: final.attempts,
      total_ms: Date.now() - t0,
      error: final.ok ? undefined : String((final.error as Error)?.message ?? final.error ?? "send failed"),
    } satisfies DprSendResponse,
    { status: final.ok ? 200 : 502 },
  );
});
