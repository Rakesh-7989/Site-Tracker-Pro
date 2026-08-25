import type { TypedSupabaseClient } from "@/lib/supabase";

export type DprLanguageId = "te" | "hi" | "en";

export interface DprSendPayload {
  client_token: string;
  org_id: string;
  project_id: string | null;
  supervisor_user_id: string | null;
  promoter_phone_e164: string;
  language: DprLanguageId;
  transcript_text: string | null;
  photo_url: string | null;
  photo_taken_at: string | null;
  photo_lat: number | null;
  photo_lon: number | null;
  voice_audio_url: string | null;
  voice_audio_sha256: string | null;
}

const SUPPORTED_LANGS: DprLanguageId[] = ["te", "hi", "en"];

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

export function makeClientToken(rand?: () => string): string {
  if (rand) return rand();
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function round6(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value * 1e6) / 1e6;
}

export interface DprComposeInput {
  orgId: string;
  projectId: string | null;
  supervisorUserId: string | null;
  promoterPhone: string;
  language?: DprLanguageId;
  transcript?: string | null;
  photoLat?: number | null;
  photoLon?: number | null;
  photoTakenAt?: string | null;
  clientToken?: string;
}

export function buildDprPayload(input: DprComposeInput): DprSendPayload {
  const phone = normalizeE164(input.promoterPhone);
  if (!phone) throw new Error("Enter a valid phone number (+91XXXXXXXXXX)");
  const lang = input.language ?? "te";
  if (!SUPPORTED_LANGS.includes(lang)) throw new Error(`unsupported language: ${lang}`);
  return {
    client_token: input.clientToken ?? makeClientToken(),
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    supervisor_user_id: input.supervisorUserId ?? null,
    promoter_phone_e164: phone,
    language: lang,
    transcript_text: input.transcript?.trim() || null,
    photo_url: null,
    photo_taken_at: input.photoTakenAt ?? null,
    photo_lat: round6(input.photoLat),
    photo_lon: round6(input.photoLon),
    voice_audio_url: null,
    voice_audio_sha256: null,
  };
}

export const DPR_MEDIA_BUCKET = "dpr-media";

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadBlob(
  client: TypedSupabaseClient,
  path: string,
  blob: Blob,
): Promise<string | null> {
  const { error } = await client.storage.from(DPR_MEDIA_BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(`media-upload-failed:${error.message}`);
  const { data } = client.storage.from(DPR_MEDIA_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function uploadDprMedia(
  client: TypedSupabaseClient,
  orgId: string,
  media: { photo?: Blob; voice?: Blob },
): Promise<Pick<DprSendPayload, "photo_url" | "voice_audio_url" | "voice_audio_sha256">> {
  const date = new Date().toISOString().slice(0, 10);
  const refs: Pick<DprSendPayload, "photo_url" | "voice_audio_url" | "voice_audio_sha256"> = {
    photo_url: null,
    voice_audio_url: null,
    voice_audio_sha256: null,
  };
  if (media.photo) {
    const ext = media.photo.type.includes("png") ? "png" : "jpg";
    refs.photo_url = await uploadBlob(
      client,
      `${orgId}/${date}/${crypto.randomUUID()}.${ext}`,
      media.photo,
    );
  }
  if (media.voice) {
    const sha = await sha256Hex(media.voice);
    const ext = media.voice.type.includes("mp4") ? "mp4" : "webm";
    refs.voice_audio_url = await uploadBlob(client, `${orgId}/${date}/${sha}.${ext}`, media.voice);
    refs.voice_audio_sha256 = sha;
  }
  return refs;
}

export async function invokeSendDpr(
  client: TypedSupabaseClient,
  payload: DprSendPayload,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await client.functions.invoke("whatsapp_dpr_send", {
      body: payload,
    });
    if (error) return { ok: false, error: error.message };
    if (data && typeof data === "object" && "ok" in data) {
      const body = data as { ok: boolean; error?: string };
      return body.ok ? { ok: true } : { ok: false, error: body.error ?? "ef-rejected" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ef-invoke-failed" };
  }
}
