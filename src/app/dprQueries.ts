export type DprStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed";

export interface DprMessageRow {
  id: string;
  orgId: string;
  projectId: string | null;
  transcript: string | null;
  voiceUrl: string | null;
  photoUrl: string | null;
  lat: number | null;
  lon: number | null;
  status: DprStatus;
  promoterPhone: string;
  supervisorName: string | null;
  language: string | null;
  clientToken: string;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

export type MResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listDprMessages(client: any, orgId: string, limit = 50): Promise<MResult<DprMessageRow[]>> {
  try {
    const { data, error } = await client
      .from("dpr_messages")
      .select("id, org_id, project_id, transcript, voice_url, photo_url, lat, lon, status, promoter_phone, supervisor_name, language, client_token, attempts, created_at, sent_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as any[]).map(r => ({
      id: String(r.id),
      orgId: String(r.org_id),
      projectId: r.project_id ? String(r.project_id) : null,
      transcript: r.transcript ?? null,
      voiceUrl: r.voice_url ?? null,
      photoUrl: r.photo_url ?? null,
      lat: r.lat ?? null,
      lon: r.lon ?? null,
      status: (r.status ?? "queued") as DprStatus,
      promoterPhone: String(r.promoter_phone ?? ""),
      supervisorName: r.supervisor_name ?? null,
      language: r.language ?? null,
      clientToken: String(r.client_token ?? ""),
      attempts: typeof r.attempts === "number" ? r.attempts : 0,
      createdAt: String(r.created_at ?? ""),
      sentAt: r.sent_at ? String(r.sent_at) : null,
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
