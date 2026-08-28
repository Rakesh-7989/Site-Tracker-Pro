// SiteTrack Pro — Sprint 2 DPR submit pipeline (pure + testable).
//
// Wires the Daily Progress Report compose flow (DPRComposer) to the real
// backend: uploads photo/voice media to the `dpr-media` storage bucket,
// snapshots the intent into the offline queue (offlineQueue kind "dpr"),
// then attempts a live send via the `whatsapp_dpr_send` Edge Function.
//
// The logic is split into:
//   - pure, dependency-free helpers  (normalizeE164, buildDprPayload, makeClientToken)
//   - concrete adapters over the Supabase client (media upload, EF invoke)
//   - one orchestrator (submitDpr) that composes them for the DPRComposer.
//
// The orchestrator is dependency-injected so tests exercise the real control
// flow without a backend: inject `send` / `enqueue` / `uploadMedia` fns.

import { hashAudio } from "../../lib/integrations/voiceTranscribe";
import { uploadPhoto } from "../../lib/integrations/photoStorage";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DprLanguageId = "te" | "hi" | "en";
export type DprSendStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed";

/** snake_case body the `whatsapp_dpr_send` Edge Function expects. */
export interface DprSendPayload {
  client_token: string;
  org_id: string;
  project_id?: string | null;
  supervisor_user_id?: string | null;
  promoter_phone_e164: string;
  language: DprLanguageId;
  voice_audio_url?: string | null;
  voice_audio_sha256?: string | null;
  transcript_text?: string | null;
  transcript_confidence?: number | null;
  transcript_provider?: string | null;
  photo_url?: string | null;
  photo_taken_at?: string | null;
  photo_lat?: number | null;
  photo_lon?: number | null;
  photo_accuracy_metres?: number | null;
  buildnow_anchor_url?: string | null;
  buildnow_anchor_hash?: string | null;
  /** Spatial hierarchy node ref (P2.4, migration 210). Null = not stamped. */
  location_id?: string | null;
}

export interface DprMediaInput {
  photo?: Blob;
  voice?: Blob;
}

export interface DprMediaRefs {
  photoUrl?: string;
  photoSha256?: string;
  voiceUrl?: string;
  voiceSha256?: string;
  photoTakenAt?: string | null;
  photoLat?: number | null;
  photoLon?: number | null;
}

export type DprMediaUploadResult =
  | { ok: true; refs: DprMediaRefs }
  | { ok: false; error: string };

export interface DprSubmitInput {
  orgId: string;
  projectId?: string | null;
  supervisorUserId?: string | null;
  promoterPhone: string;
  language?: DprLanguageId;
  transcript?: string | null;
  confidence?: number | null;
  provider?: string | null;
  photoLat?: number | null;
  photoLon?: number | null;
  photoTakenAt?: string | null;
  buildnowAnchorUrl?: string | null;
  buildnowAnchorHash?: string | null;
  /** Spatial hierarchy node ref (P2.4). Passed through to the EF body. */
  locationId?: string | null;
  /** explicit idempotency key — 10-15 digit E.164 phone is used as the
      caller-facing id, plus this token. Defaults to makeClientToken(). */
  clientToken?: string;
  now?: Date;
}

export interface DprSubmitResult {
  ok: boolean;
  status?: DprSendStatus;
  dprMessageId?: string;
  queuedId?: string;
  queued: boolean;
  error?: string;
}

export interface StorageAdapter {
  put: (bucket: string, path: string, blob: Blob) => Promise<{ ok: boolean; url?: string; error?: string }>;
}

/** The injected runtime the orchestrator depends on. Each is test-injectable. */
export interface DprRuntime {
  /** Upload any DPR media blobs → returns public URLs + sha256. Undefined = no media. */
  uploadMedia?: (payload: DprSendPayload, media: DprMediaInput) => Promise<DprMediaUploadResult>;
  /** Persist the intent for offline retry. Optional — submit then sends inline. */
  enqueue?: (item: { key: string; kind: string; payload: unknown }) => Promise<string>;
  /** The actual WhatsApp DPR send (EF invoke). Optional → item stays queued. */
  send?: (payload: DprSendPayload) => Promise<{
    ok: boolean;
    status?: DprSendStatus;
    dprMessageId?: string;
    error?: string;
  }>;
  /** true when the device believes it is online (default true). */
  online?: boolean;
  now?: Date;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

const SUPPORTED_LANGS: DprLanguageId[] = ["te", "hi", "en"];

/** Normalize a phone to E.164 (+<10-15 digits>) or null if invalid. */
export function normalizeE164(phone: string | null | undefined): string | null {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    if (/^\d{10,15}$/.test(rest)) return `+${rest}`;
    return null;
  }
  if (/^\d{10,15}$/.test(digits)) return `+${digits}`;
  return null;
}

/** Getter-free idempotency key (UUID when available, else a time+counter token). */
export function makeClientToken(rand?: () => string): string {
  const f = rand ?? (typeof crypto !== "undefined" && crypto.randomUUID
    ? () => crypto.randomUUID()
    : () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`);
  return f();
}

/** Round a coordinate to 6 decimals (≈0.1 m) — matches the EF/buildnow lib. */
function round(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Build the snake_case Edge Function body from the camelCase compose input.
 * Pure — no uploads, no network. Throws on invalid phone/language.
 */
export function buildDprPayload(input: DprSubmitInput): DprSendPayload {
  const phone = normalizeE164(input.promoterPhone);
  if (!phone) throw new Error("promoterPhone must be a valid +<digits> E.164 number");
  const lang = input.language ?? "te";
  if (!SUPPORTED_LANGS.includes(lang)) throw new Error(`unsupported language: ${lang}`);

  const transcript = input.transcript != null ? String(input.transcript).trim() : null;
  const confidence =
    typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(1, input.confidence))
      : null;

  return {
    client_token: input.clientToken ?? makeClientToken(),
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    supervisor_user_id: input.supervisorUserId ?? null,
    promoter_phone_e164: phone,
    language: lang,
    transcript_text: transcript || null,
    transcript_confidence: confidence,
    transcript_provider: input.provider ?? null,
    photo_lat: round(input.photoLat),
    photo_lon: round(input.photoLon),
    photo_taken_at: input.photoTakenAt ?? null,
    buildnow_anchor_url: input.buildnowAnchorUrl ?? null,
    buildnow_anchor_hash: input.buildnowAnchorHash ?? null,
    location_id: input.locationId ?? null,
  };
}

// ── Storage adapters ──────────────────────────────────────────────────────────

export const DPR_MEDIA_BUCKET = "dpr-media";

/** Wrap a Supabase client's storage for the `uploadPhoto` StorageAdapter shape. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function makeSupabaseStorageAdapter(client: any): { put: (bucket: string, path: string, blob: Blob) => Promise<{ ok: boolean; url?: string; error?: string }> } {
  return {
    async put(bucket, path, blob) {
      try {
        const { error } = await client.storage.from(bucket).upload(path, blob, {
          contentType: blob.type || "application/octet-stream",
          cacheControl: "3600",
          upsert: true,
        });
        if (error) return { ok: false, error: String(error.message ?? error) };
        const { data } = client.storage.from(bucket).getPublicUrl(path);
        return { ok: true, url: String(data?.publicUrl ?? "") };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** Storage path for a voice clip: <orgId>/<date>/<sha>.<ext>. */
export function voiceObjectPath(orgId: string, sha256: string, ext = "webm"): string {
  const date = new Date().toISOString().slice(0, 10);
  const safe = /^[0-9a-f]{64}$/.test(sha256) ? sha256 : "unknown";
  return `${orgId}/${date}/${safe}.${ext}`;
}

export function mediaDatePath(orgId: string, takenAt?: string | null): string {
  const d = (takenAt || "").slice(0, 10).replace(/:/g, "-") || new Date().toISOString().slice(0, 10);
  return `${orgId}/${d}`;
}

/**
 * Upload DPR media (photo + voice) to the dpr-media bucket via the injected
 * client. Photo uses the rich photoStorage.uploadPhoto pipeline (compress,
 * EXIF, thumbnail); voice is a plain upload + sha256.
 */
export async function uploadDprMedia(
  client: any,
  media: DprMediaInput,
  opts: { orgId: string; photoTakenAt?: string | null; requireGeotag?: boolean } = { orgId: "" },
): Promise<{ ok: true; refs: DprMediaRefs } | { ok: false; error: string }> {
  const adapter = makeSupabaseStorageAdapter(client);
  const refs: DprMediaRefs = {};
  try {
    if (media.photo) {
      const up = await uploadPhoto(media.photo, {
        bucket: DPR_MEDIA_BUCKET,
        orgId: opts.orgId,
        adapter,
        requireGeotag: opts.requireGeotag ?? false,
      });
      if (!up.ok) return { ok: false, error: `photo upload failed: ${up.error ?? "unknown"}` };
      refs.photoUrl = up.url;
      if (up.sha256) refs.photoSha256 = up.sha256;
      const gps = up.exif?.gps ?? null;
      if (gps) {
        refs.photoLat = round(gps.lat);
        refs.photoLon = round(gps.lon);
      }
    }
    if (media.voice) {
      const sha = await hashAudio(media.voice);
      const ext = media.voice.type.includes("mp4") ? "mp4" : "webm";
      const path = `${mediaDatePath(opts.orgId)}/${sha}.${ext}`;
      const res = await adapter.put(DPR_MEDIA_BUCKET, path, media.voice);
      if (!res.ok) return { ok: false, error: `voice upload failed: ${res.error ?? "unknown"}` };
      refs.voiceUrl = res.url;
      refs.voiceSha256 = sha;
    }
    return { ok: true, refs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Edge Function adapter ─────────────────────────────────────────────────────

/**
 * Invoke `whatsapp_dpr_send` and normalize both the happy path (data.ok) and
 * the error path (FunctionsHttpError → .context.json() body, else message).
 */
export async function invokeSendDpr(client: any, payload: DprSendPayload): Promise<{
  ok: boolean;
  status?: DprSendStatus;
  dprMessageId?: string;
  error?: string;
}> {
  try {
    const { data, error } = await client.functions.invoke("whatsapp_dpr_send", { body: payload });
    if (error) {
      // Supabase-js wraps non-2xx bodies; try to read the EF's JSON.error.
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) return { ok: false, error: String(body.error) };
      } catch { /* fall through */ }
      return { ok: false, error: String((error as any).message ?? error) };
    }
    return {
      ok: data?.ok !== false,
      status: data?.status as DprSendStatus | undefined,
      dprMessageId: data?.dpr_message_id ? String(data.dpr_message_id) : undefined,
      error: data?.error ? String(data.error) : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: DprSendStatus[] = ["sent", "delivered", "read"];

/**
 * Run the DPR submit pipeline:
 *   1. validate + build the EF payload (pure)
 *   2. upload media (photo/voice) if provided
 *   3. snapshot the intent to the offline queue (best-effort, non-fatal)
 *   4. if online + a send fn is provided → attempt the real WhatsApp EF send
 *      (returns its status); otherwise the item stays queued for re-drain.
 *
 * Returns `queued: true` whenever the intent is durably stored but not yet
 * confirmed sent — the composer shows that state + a queued indicator.
 */
/** Envelope stored in the offline queue when media must be uploaded after reconnect. */
export interface DeferredDprQueuePayload {
  __deferredDpr: true;
  payload: DprSendPayload;
  media: DprMediaInput;
  orgId: string;
}

export function isDeferredDprQueuePayload(v: unknown): v is DeferredDprQueuePayload {
  return !!v && typeof v === "object" && (v as Record<string, unknown>).__deferredDpr === true
    && (v as Record<string, unknown>).payload != null && (v as Record<string, unknown>).media != null;
}

/** Merge media refs (from a successful upload) into a DPR payload — pure. */
export function applyMediaRefs(payload: DprSendPayload, refs: DprMediaRefs): DprSendPayload {
  const next = { ...payload };
  if (refs.photoUrl) next.photo_url = refs.photoUrl;
  if (refs.voiceUrl) next.voice_audio_url = refs.voiceUrl;
  if (refs.voiceSha256) next.voice_audio_sha256 = refs.voiceSha256;
  if (refs.photoLat != null) next.photo_lat = refs.photoLat;
  if (refs.photoLon != null) next.photo_lon = refs.photoLon;
  if (refs.photoTakenAt) next.photo_taken_at = refs.photoTakenAt;
  return next;
}

export async function submitDpr(
  input: DprSubmitInput,
  media: DprMediaInput,
  runtime: DprRuntime = {},
): Promise<DprSubmitResult> {
  let payload: DprSendPayload;
  try {
    payload = buildDprPayload(input);
  } catch (e) {
    return { ok: false, queued: false, error: e instanceof Error ? e.message : String(e) };
  }

  const hasMedia = !!(media.photo || media.voice);
  const online = runtime.online !== false;

  // Offline with media → defer the Blob upload until drain (IDB can store Blobs).
  // This makes Ravi's field photo truly offline — "Send" instantly queues instead
  // of hard-failing on upload (G1).
  if (hasMedia && !online) {
    if (runtime.enqueue) {
      const deferred: DeferredDprQueuePayload = { __deferredDpr: true, payload, media, orgId: input.orgId };
      let queuedId: string | undefined;
      try {
        queuedId = await runtime.enqueue({ key: payload.client_token, kind: "dpr", payload: deferred });
      } catch { queuedId = undefined; }
      if (queuedId) return { ok: true, status: "queued", queuedId, queued: true };
    }
    // No queue available offline — fall through to the upload path which will
    // hard-fail with a clear error (better than silent drop).
  }

  if (runtime.uploadMedia && hasMedia && online) {
    const up = await runtime.uploadMedia(payload, media);
    if (!up.ok) return { ok: false, queued: false, error: up.error };
    payload = applyMediaRefs(payload, up.refs);
  }

  let queuedId: string | undefined;
  if (runtime.enqueue) {
    try {
      queuedId = await runtime.enqueue({ key: payload.client_token, kind: "dpr", payload });
    } catch (e) {
      // Queue is best-effort — a full submit should still attempt the send.
      queuedId = undefined;
    }
  }

  if (runtime.send && online) {
    const res = await runtime.send(payload);
    if (res.ok) {
      const status = TO_STATUS(res.status);
      if (status && TERMINAL_STATUSES.includes(status)) {
        return { ok: true, status, dprMessageId: res.dprMessageId, queuedId, queued: false };
      }
      return { ok: true, status: status ?? "sent", dprMessageId: res.dprMessageId, queuedId, queued: false, error: res.error };
    }
    // Send failed (e.g. Meta not configured) → keep the durable intent queued.
    return { ok: true, status: queuedId ? "queued" : "sending", queuedId, queued: true, error: res.error };
  }

  return { ok: true, status: "queued", queuedId, queued: queuedId != null };
}

/** Normalize an arbitrary EF status string to the DprSendStatus union (or null). */
function TO_STATUS(s: unknown): DprSendStatus | null {
  const set: DprSendStatus[] = ["queued", "sending", "sent", "delivered", "read", "failed"];
  return set.includes(s as DprSendStatus) ? (s as DprSendStatus) : null;
}

/**
 * Concrete runtime for the DPRComposer: uploads media to `dpr-media`, keeps
 * an offline-queue snapshot (kind "dpr") and sends via the whatsapp_dpr_send
 * Edge Function. All bound to one Supabase client + org.
 */
export function makeSupabaseDprRuntime(client: any, orgId: string, opts: { online?: boolean } = {}): DprRuntime {
  return {
    uploadMedia: (payload, media) => uploadDprMedia(client, media, {
      orgId,
      photoTakenAt: payload.photo_taken_at ?? null,
    }),
    enqueue: async (item) => {
      const mod = await import("../../lib/platform/offlineQueue");
      return mod.enqueue(item);
    },
    send: (payload) => invokeSendDpr(client, payload),
    online: opts.online,
  };
}