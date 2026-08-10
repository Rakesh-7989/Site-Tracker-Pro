export type DprStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed";

export interface DprMessageRow {
  id: string;
  orgId: string;
  projectId: string | null;
  transcript: string | null;
  voiceUrl: string | null;
  voiceSha256: string | null;
  photoUrl: string | null;
  photoTakenAt: string | null;
  lat: number | null;
  lon: number | null;
  photoAccuracyMetres: number | null;
  status: DprStatus;
  promoterPhone: string;
  supervisorName: string | null;
  language: string | null;
  clientToken: string;
  attempts: number;
  failureReason: string | null;
  metaMessageId: string | null;
  buildnowAnchorUrl: string | null;
  buildnowAnchorHash: string | null;
  buildnowSyncedAt: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface DprDeliveryLogRow {
  id: string;
  dprMessageId: string;
  attemptNumber: number;
  attemptedAt: string;
  outcome: "success" | "retry" | "failed";
  durationMs: number | null;
  statusCode: number | null;
  errorCode: string | null;
  errorDetail: string | null;
}

export type MResult<T> = { ok: true; data: T } | { ok: false; error: string };

const SELECT = "id, org_id, project_id, transcript_text, voice_audio_url, voice_audio_sha256, photo_url, photo_taken_at, photo_lat, photo_lon, photo_accuracy_metres, status, promoter_phone_e164, supervisor:supervisor_user_id(name), language, client_token, attempts, failure_reason, meta_message_id, buildnow_anchor_url, buildnow_anchor_hash, buildnow_synced_at, created_at, sent_at";

function mapRow(r: any): DprMessageRow {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    projectId: r.project_id ? String(r.project_id) : null,
    transcript: r.transcript_text ?? null,
    voiceUrl: r.voice_audio_url ?? null,
    voiceSha256: r.voice_audio_sha256 ?? null,
    photoUrl: r.photo_url ?? null,
    photoTakenAt: r.photo_taken_at ?? null,
    lat: r.photo_lat == null ? null : Number(r.photo_lat),
    lon: r.photo_lon == null ? null : Number(r.photo_lon),
    photoAccuracyMetres: r.photo_accuracy_metres ?? null,
    status: (r.status ?? "queued") as DprStatus,
    promoterPhone: String(r.promoter_phone_e164 ?? ""),
    supervisorName: r.supervisor?.name ?? null,
    language: r.language ?? null,
    clientToken: String(r.client_token ?? ""),
    attempts: typeof r.attempts === "number" ? r.attempts : 0,
    failureReason: r.failure_reason ?? null,
    metaMessageId: r.meta_message_id ?? null,
    buildnowAnchorUrl: r.buildnow_anchor_url ?? null,
    buildnowAnchorHash: r.buildnow_anchor_hash ?? null,
    buildnowSyncedAt: r.buildnow_synced_at ?? null,
    createdAt: String(r.created_at ?? ""),
    sentAt: r.sent_at ? String(r.sent_at) : null,
  };
}

export async function listDprMessages(client: any, orgId: string, limit = 50): Promise<MResult<DprMessageRow[]>> {
  try {
    const { data, error } = await client
      .from("dpr_messages")
      .select(SELECT)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as any[]).map(mapRow) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fetch a single DPR message — org-scoped so a caller can't read cross-org rows. */
export async function getDprMessage(client: any, orgId: string, id: string): Promise<MResult<DprMessageRow | null>> {
  try {
    const { data, error } = await client
      .from("dpr_messages")
      .select(SELECT)
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: data ? mapRow(data) : null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Per-attempt delivery log for one DPR message (attempt_number asc). */
export async function listDprDeliveryLog(client: any, dprMessageId: string): Promise<MResult<DprDeliveryLogRow[]>> {
  try {
    const { data, error } = await client
      .from("dpr_delivery_log")
      .select("id, dpr_message_id, attempt_number, attempted_at, outcome, duration_ms, status_code, error_code, error_detail")
      .eq("dpr_message_id", dprMessageId)
      .order("attempt_number", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows: DprDeliveryLogRow[] = ((data ?? []) as any[]).map(r => ({
      id: String(r.id),
      dprMessageId: String(r.dpr_message_id),
      attemptNumber: Number(r.attempt_number ?? 0),
      attemptedAt: String(r.attempted_at ?? ""),
      outcome: (r.outcome ?? "retry") as DprDeliveryLogRow["outcome"],
      durationMs: r.duration_ms ?? null,
      statusCode: r.status_code ?? null,
      errorCode: r.error_code ?? null,
      errorDetail: r.error_detail ?? null,
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Latest BuildNow snapshot for a project (migration 52 RPC), shaped for the BuildNowBadge metadata. */
export async function getBuildnowAnchor(client: any, projectId: string): Promise<MResult<{ approval_status?: string; fetched_at?: string | number } | null>> {
  try {
    const { data, error } = await client.rpc("buildnow_latest_for_project", { p_project_id: projectId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        approval_status: row.approval_status ?? undefined,
        fetched_at: row.fetched_at ?? undefined,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
